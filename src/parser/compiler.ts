import {
    ActionDeclaration,
    ActionsDeclaration,
    Expression,
    ExpressionDeclaration,
    grammar,
    GraphDeclaration,
    OuterConstDeclaration,
    OuterDeclaration,
    OuterFunctionDeclaration,
    ParserOutput,
    PointDeclaration,
    PolygonDeclaration,
    ColorDeclaration,
    semantic,
    Statement,
    Template
} from "./grammar";
import ops from "../libs/ops";
import stdlib from "../libs/stdlib";
import {SimplifyExpression} from "./simplify";
import {TemplateContext, TemplateFunction, TemplateState} from "../types";
import path from "path";
import * as fs from "fs";
import {HandleName, opMap} from "./util";
import piecewiseOps from "../libs/piecewiseOps";

/**
 * Compiles LogiMat to a math function (or multiple). Each function/variable will be on a separate line.
 * @param input {string} - is the input LogiMat code that will be compiled.
 * @param useTex {boolean} - is a value indicating if the output should be converted to Tex.
 * @param noFS {boolean} - is a valid indicating if untrusted filesystem operations should be blocked (for example, code telling the compiler to load an NPM module). This is not a security feature.
 * @param filePath {string} - is a path to the file currently being compiled.
 * @param piecewise {boolean} - is a value indicating if the output should use piecewise instead of pure math for logic.
 * @param strict {boolean} - is a value indicating if an error should be thrown if an undefined function/variable is used.
 */
export const Compile = (input: string, useTex: boolean = false, noFS = false, filePath: string = null, piecewise: boolean = false, strict: boolean = false) : string => {
    const tree = GetTree(input);

    const state: TemplateState = {};

    if(!noFS && typeof(filePath) === "string") {
        module.paths.push(filePath);
    }

    const templates: Record<string, TemplateFunction> = {
        import: (args, state1, context) => {
            if(noFS) throw new Error("Import failed: filesystem operations have been disabled.");
            if(context !== TemplateContext.OuterDeclaration) throw new Error("The import template can only be used outside of any methods!");
            if(args.length < 1 || typeof(args[0]) !== "string" || !args[0]) throw new Error("A path to the file to import must be defined!");

            const importPath = args[0];

            if(path.isAbsolute(importPath)) {
                return fs.readFileSync(importPath, "utf-8");
            }

            return fs.readFileSync(path.join(filePath, importPath), "utf-8");
        }
    };

    const postTemplates: string[] = [];

    for (const declaration of tree.imports) {
        if(noFS) throw new Error("Import failed: filesystem operations have been disabled.");

        if(declaration.importType === "template") {
            try {
                const module = require(declaration.path);
                if(!module.hasOwnProperty("templates")) throw new Error("Module does not contain templates!");
                if(typeof(module.templates) !== "object" || Array.isArray(module.templates)) throw new Error("Templates is not an object!");

                for (const templateKey of Object.keys(module.templates)) {
                    const template = module.templates[templateKey];

                    if(typeof(template) !== "object" || Array.isArray(module.templates) || !template.hasOwnProperty("function") || typeof(template.function) !== "function") {
                        throw new Error("Template \"" + templateKey + "\" on module \"" + declaration.path + "\" is not defined correctly!");
                    }

                    templates[templateKey] = template.function;
                }

                if(!module.hasOwnProperty("postTemplates")) continue;
                if(typeof(module.postTemplates) !== "string") throw new Error("PostTemplates is not a string!");

                postTemplates.push(module.postTemplates);
            } catch(e) {
                console.error("An error occurred while loading module \"" + declaration.path + "\".");
                throw e;
            }
        }
    }

    let declarations = TraverseTemplatesArr(tree.declarations, templates, state);

    //Allow up to 50 layers of functions.
    for(let i = 0; i < 50; i++) {
        declarations = TraverseTemplatesArr(declarations, templates, state);
    }

    declarations.push(...GetTree(postTemplates.join("\n")).declarations);

    for(let i = 0; i < 50; i++) {
        declarations = TraverseTemplatesArr(declarations, templates, state);
    }

    const inlines: Record<string, Inline> = {
        ...GetInlines(declarations),
        ...GetInlines(GetTree(stdlib).declarations),
        ...GetInlines(GetTree((piecewise ? piecewiseOps : ops)).declarations)
    };

    const stack = [];

    try {
        return InternalCompile(useTex, declarations, inlines, templates, state, stack, strict).join("\n");
    } catch(e) {
        if(stack.length > 0) console.error("Call stack: " + stack.slice(0, Math.min(20, stack.length)).join(" -> "));
        throw e;
    }
}

const TraverseTemplatesArr = (input: any[], templates: Record<string, TemplateFunction>, state: TemplateState) : any[] => {
    const output: any[] = [];

    for (const val of input) {
        if(Array.isArray(val)) {
            output.push([...TraverseTemplatesArr(val, templates, state)]);
        } else if(typeof(val) === "object") {
            const newVal = TraverseTemplatesObj(val, templates, state);
            if(Array.isArray(newVal)) output.push(...newVal);
            else output.push(newVal);
        } else {
            output.push(val);
        }
    }

    return output;
}

const TraverseTemplatesObj = (input: object, templates: Record<string, TemplateFunction>, state: TemplateState) : object | any[] => {
    if(input == null) return null;

    if(input.hasOwnProperty("type") && ["template", "templatefunction"].includes(input["type"])) {
        return HandleTemplate(<Template>input, templates, state);
    }

    const output: object = {};

    for (const key in input) {
        const val = input[key];
        if(Array.isArray(val)) {
            output[key] = TraverseTemplatesArr(val, templates, state);
        } else if(typeof(val) === "object") {
            output[key] = TraverseTemplatesObj(val, templates, state);
        } else {
            output[key] = val;
        }
    }

    return output;
}

const HandleTemplate = (templateDeclaration: Template, templates: Record<string, TemplateFunction>, state: TemplateState) : any[] | object => {
    let output;

    if(templateDeclaration.type === "templatefunction") {
        // @ts-ignore
        output = templateDeclaration.function(state)
    } else {
        if(!templates.hasOwnProperty(templateDeclaration.name)) throw new Error("Template \"" + templateDeclaration.name + "\" does not exist!");

        try {
            output = templates[templateDeclaration.name](templateDeclaration.args, state, templateDeclaration.context);
        } catch(e) {
            console.error("An error occurred while running the \"" + templateDeclaration.name + "\" template:");
            throw e;
        }
    }

    if(output instanceof Function) {
        return {type: "templatefunction", context: templateDeclaration.context, function: output};
    }

    //TODO: Allow templates to import other templates.

    switch(templateDeclaration.context) {
        case TemplateContext.OuterDeclaration:
            return TraverseTemplatesArr(GetTree(output).declarations, templates, state);
        case TemplateContext.InnerDeclaration:
            return TraverseTemplatesArr(GetStatementsTree(output), templates, state);
        case TemplateContext.Expression:
            const expr = GetExpression(output);
            if(typeof(expr) === "object") {
                return TraverseTemplatesObj(expr, templates, state);
            }

            return expr;
    }

    return [];
}

const InternalCompile = (useTex: boolean, tree: OuterDeclaration[], inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: TemplateState, stack: string[], strict: boolean) : string[] => {
    let out: string[] = [];

    const outerNames = GetDeclaredNames(tree);

    for (const declaration of tree) {
        if (declaration.modifier === "inline") continue;

        const names = Object.assign([], outerNames);

        switch(declaration.type) {
            case "function":
                const functionDeclaration = <OuterFunctionDeclaration>declaration;
                out.push(HandleName(functionDeclaration.name) + "(" + functionDeclaration.args.map(HandleName).join(",") + ")" + "=" + SimplifyExpression(CompileBlock(functionDeclaration.block, inlines, templates, state, "", {}, {}, stack, names), useTex, strict, names.concat(functionDeclaration.args)));
                break;
            case "const":
                const constDeclaration = <OuterConstDeclaration>declaration;
                out.push(HandleName(constDeclaration.name) + "=" + SimplifyExpression(CompileExpression(constDeclaration.expr, inlines, templates, state, {}, stack, names), useTex, strict, names));
                break;
            case "action":
                const actionDeclaration = <ActionDeclaration>declaration;
                out.push((actionDeclaration.funcName ? HandleName(actionDeclaration.funcName) + (actionDeclaration.args ? "(" + actionDeclaration.args.map(HandleName).join(",") + ")" : "") + "=" : "") + HandleName(actionDeclaration.name) + "\\to " + SimplifyExpression(CompileBlock(actionDeclaration.block, inlines, templates, state, actionDeclaration.name, {}, {}, stack, names), useTex, strict, actionDeclaration.args ? names.concat(actionDeclaration.args) : names));
                break;
            case "actions":
                const actionsDeclaration = <ActionsDeclaration>declaration;

                //Get the name without the args (the first part before the opening parenthesis)
                const badActions = actionsDeclaration.args.filter(action => !names.includes(action[0]));
                if(strict && badActions.length > 0) {
                    throw new Error("The following actions have not been defined: " + badActions.map(action => "\"" + action + "\"").join(", ") + ".");
                }

                out.push(HandleName(actionsDeclaration.name) + (actionsDeclaration.actionArgs ? "(" + actionsDeclaration.actionArgs.map(HandleName).join(",") + ")" : "") + "=" + actionsDeclaration.args.map(action => HandleName(action[0]) + (action.length > 1 ? "(" + action.slice(1).map(HandleName) + ")" : "")).join(","));
                break;
            case "expression":
                const expressionDeclaration = <ExpressionDeclaration>declaration;
                out.push(SimplifyExpression(CompileBlock(expressionDeclaration.block, inlines, templates, state, "", {}, {}, stack, names), useTex, strict, names));
                break;
            case "graph":
                const graphDeclaration = <GraphDeclaration>declaration;
                out.push(SimplifyExpression(CompileExpression(graphDeclaration.p1, inlines, templates, state, {}, stack, names), useTex, strict, names) + opMap[graphDeclaration.op] + SimplifyExpression(CompileExpression(graphDeclaration.p2, inlines, templates, state, {}, stack, names), useTex, strict, names));
                break;
            case "point":
                const pointDeclaration = <PointDeclaration>declaration;
                out.push(SimplifyExpression(CompileExpression(pointDeclaration.point, inlines, templates, state, {}, stack, names), useTex, strict, names));
                break;
            case "polygon":
                const polygonDeclaration = <PolygonDeclaration>declaration;
                out.push("\\operatorname{polygon}" + (useTex ? "\\left(" : "(") + polygonDeclaration.points.map(point => SimplifyExpression(CompileExpression(point, inlines, templates, state, {}, stack, names), useTex, strict, names)).join(",") + (useTex ? "\\right)" : ")"));
                break;
            case "color":
                const colorDeclaration = <ColorDeclaration>declaration;
                out.push(HandleName(colorDeclaration.name) + "=" + "\\operatorname{rgb}=" + (useTex ? "\\left(" : "(") + colorDeclaration.args.map(HandleName) + (useTex ? "\\right)" : ")"));
                break;
        }
    }

    return out;
}

const GetTree = (input: string) : ParserOutput => {
    const match = grammar.match(input);
    if(match.failed()) throw new Error(match.message);

    return semantic(match).parse();
}

const GetStatementsTree = (input: string) : Statement[] => {
    if(input.trim() === "") return [];

    const match = grammar.match(input, "InnerDeclarations");
    if(match.failed()) throw new Error(match.message);

    return semantic(match).parse();
}

const GetExpression = (input: string) : Expression => {
    const match = grammar.match(input, "Expression");
    if(match.failed()) throw new Error(match.message);

    return semantic(match).parse();
}

const GetInlines = (tree: OuterDeclaration[]) : Record<string, Inline> => {
    const inlines: Record<string, Inline> = {};

    for (const declaration of tree) {
        if(declaration.modifier === "inline") inlines[declaration["name"]] = {function: declaration.type === "function", value: declaration};
    }

    return inlines;
}

const GetDeclaredNames = (tree: OuterDeclaration[]) : string[] => {
    const output: string[] = [];

    for (const declaration of tree) {
        if(declaration.type === "action") {
            if(declaration["funcName"]) output.push(declaration["funcName"]);
        } else {
            if(declaration["name"]) output.push(declaration["name"]);
        }
    }

    return output;
}

const CompileBlock = (input: Statement[], inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: TemplateState, defaultOut = "", vars: Record<string, string> = {}, args: Record<string, string> = {}, stack: string[], declaredNames: string[]) : string => {
    let out = defaultOut;
    let newVars = {
        ...vars,
        ...args
    };

    for (const statement of input) {
        switch(statement.type) {
            case "const":
                newVars[statement["name"]] = CompileExpression(statement["expr"], inlines, templates, state, {
                    ...newVars,
                    state: out || vars["state"] || ""
                }, stack, declaredNames);

                break;
            case "state":
                out = CompileExpression(statement["expr"], inlines, templates, state, {
                    ...newVars,
                    state: out || vars["state"] || ""
                }, stack, declaredNames);
                break;
            case "if":
                if(!statement["elseaction"] && !out) {
                    throw new Error("The state must be set before an else-less if can be used.");
                }

                const condition = CompileExpression(statement["condition"], inlines, templates, state, {
                    ...newVars,
                    state: out
                }, stack, declaredNames);
                const ifaction = CompileBlock(statement["ifaction"], inlines, templates, state, out, {
                    ...newVars,
                    state: out
                }, {}, stack, declaredNames);
                const elseaction = statement["elseaction"] ? CompileBlock(statement["elseaction"], inlines, templates, state, out, {
                    ...newVars,
                    state: out
                }, {}, stack, declaredNames) : out;


                out = CompileExpression({type: "f", args: ["if_func", [condition, ifaction, elseaction]]}, inlines, templates, state, {
                    ...newVars,
                    state: out || vars["state"] || ""
                }, stack, declaredNames);
                break;
        }
    }

    if(out === "") throw new Error("The state must be set inside of every block.");
    return out;
}

/**
 * Handles a logic function and transforms it to a string, for when piecewise output is enabled.
 * @param name {string} - is the name of the function.
 * @param args {(string | object)[]} - is the array of arguments to the function.
 * @returns {string} The resultant string.
 */
const HandlePiecewise = (name: string, args: (string | object)[]) : string => {
    switch (name) {
        case "and":
            return `((${args[0]}) & (${args[1]}))`;
        case "or":
            return `((${args[0]}) | (${args[1]}))`;
        case "equal":
            return `((${args[0]}) == (${args[1]}))`;
        case "notEqual":
            return `if_func((${args[0]}) == (${args[1]}), 0, 1)`;
        case "lt":
            return `((${args[0]}) < (${args[1]}))`;
        case "lte":
            return `((${args[0]}) <= (${args[1]}))`;
        case "gt":
            return `((${args[0]}) > (${args[1]}))`;
        case "gte":
            return `((${args[0]}) >= (${args[1]}))`;
        default:
            return "";
    }
}

const piecewiseFunctions = [
    "and",
    "or",
    "equal",
    "notEqual",
    "lt",
    "lte",
    "gt",
    "gte"
];

const CompileExpression = (expression: Expression, inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: TemplateState, vars: Record<string, string> = {}, stack: string[], declaredNames: string[]) : string => {
    if(typeof(expression) !== "object") return expression;

    if(typeof(expression) !== "object") return expression;

    const args = expression.args.map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, inlines, templates, state, vars, stack, declaredNames) : arg);

    switch(expression.type){
        case "+":
            return "(" + args[0] + ")+(" + args[1] + ")";
        case "-":
            return "(" + args[0] + ")-(" + args[1] + ")";
        case "*":
            return "(" + args[0] + ")*(" + args[1] + ")";
        case "/":
            return "(" + args[0] + ")/(" + args[1] + ")";
        case "^":
            return "pow(" + args[0] + "," + args[1] + ")";
        case "n":
            return "-(" + args[0] + ")";
        case "f":
            const fargs = (<any[]>expression.args[1]).map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, inlines, templates, state, vars, stack, declaredNames) : arg);

            if(!inlines.hasOwnProperty(<string>expression.args[0])) {
                if(piecewiseFunctions.includes(<string>expression.args[0])) return HandlePiecewise(<string>expression.args[0], fargs);
                return <string>expression.args[0] + "(" + fargs.join(",") + ")";
            }

            const fargnames = (<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).args;

            if(fargnames.length !== fargs.length) throw new Error("Inline function \"" + expression.args[0] + "\" requires " + fargnames.length + ", but only " + fargs.length + " are given.");

            stack.push(<string>expression.args[0]);
            const result = CompileBlock((<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).block, inlines, templates, state, "", vars, Object.fromEntries(fargnames.map((v, i) => [v, fargs[i]])), stack, declaredNames);
            stack.pop();

            return result;
        case "v":
            const name = <string>expression.args[0];

            if(vars.hasOwnProperty(name)) return vars[name];
            if(inlines.hasOwnProperty(name)) return CompileExpression(inlines[name].value["expr"], inlines, templates, state, vars, stack, declaredNames);

            switch(name) {
                case "pi":
                    return "pi()";
            }

            return name;
        case "sum":
            //Make the variable name used for mapping a declared variable, in order to make it work in strict mode.
            declaredNames.push(<string>args[0]);

            return "sum(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, templates, state, "", vars, {}, stack, declaredNames) + ")";
        case "prod":
            //Make the variable name used for mapping a declared variable, in order to make it work in strict mode.
            declaredNames.push(<string>args[0]);

            return "prod(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, templates, state, "", vars, {}, stack, declaredNames) + ")";
        case "b":
            return CompileBlock(<Statement[]>expression.args[0], inlines, templates, state, "", vars, {}, stack, declaredNames);
        case "a_f":
            //Map the user-chosen variable to the array for Desmos' filter syntax.
            const filterVar = {[<string>args[1]]: <string>args[0]};

            //If it's an array (list of statements), then compile it as a block, otherwise compile the original as an expression (with the .
            const filterFunc =
                Array.isArray(args[2])
                    ? CompileBlock(<Statement[]>args[2], inlines, templates, state, "", vars, filterVar, stack, declaredNames)
                    : CompileExpression(<Expression>expression.args[2], inlines, templates, state, {...vars, ...filterVar}, stack, declaredNames);

            return "array_filter(" + args[0] + "," + filterFunc + ")";
        case "a_m":
            //Make the variable name used for mapping a declared variable, in order to make it work in strict mode.
            declaredNames.push(<string>args[1]);

            //If it's an array (list of statements), then compile it as a block, otherwise compile the original as an expression.
            const mapFunc =
                Array.isArray(args[2])
                ? CompileBlock(<Statement[]>args[2], inlines, templates, state, "", vars, {}, stack, declaredNames)
                : CompileExpression(<Expression>expression.args[2], inlines, templates, state, vars, stack, declaredNames);

            return "array_map(" + args[0] + "," + mapFunc + "," + args[1] + ")";
    }

    return "";
}

interface Inline {
    function: boolean;
    value: OuterDeclaration;
}