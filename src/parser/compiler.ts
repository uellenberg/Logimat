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
    semantic,
    Statement,
    Template
} from "./grammar";
import ops from "../libs/ops";
import stdlib from "../libs/stdlib";
import {SimplifyExpression} from "./simplify";
import {TemplateContext, TemplateFunction, TemplateModule, TemplateState} from "../types";
import path from "path";
import * as fs from "fs";
import {HandleName, opMap} from "./util";
import piecewiseOps from "../libs/piecewiseOps";
import nonPiecewiseOps from "../libs/nonPiecewiseOps";

const readFile = (path: string) => new Promise<string>((resolve, reject) => {
    fs.readFile(path, (err, val) => {
        if(err) return reject(err);
        resolve(val.toString());
    });
});

interface LogimatTemplateState {
    logimat: {
        files: string[]
    }
}

/**
 * Compiles LogiMat to a math function (or multiple). Each function/variable will be on a separate line.
 * @param input {string} - is the input LogiMat code that will be compiled.
 * @param useTex {boolean} - is a value indicating if the output should be converted to Tex.
 * @param noFS {boolean} - is a valid indicating if untrusted filesystem operations should be blocked (for example, code telling the compiler to load an NPM module). This is not a security feature.
 * @param filePath {string} - is a path to the file currently being compiled.
 * @param piecewise {boolean} - is a value indicating if the output should use piecewise instead of pure math for logic.
 * @param strict {boolean} - is a value indicating if an error should be thrown if an undefined function/variable is used.
 * @param outputMaps {boolean} - is a value indicating if the output should be a map of simplified to unsimplified output.
 * @param simplificationMap {Record<string, string>} - is a map of simplified values to unsimplified values.
 * @param importMap {Record<string, TemplateModule>} - is a map of imports which will be used instead of require if specified.
 */
export const Compile = async (input: string, useTex: boolean = false, noFS = false, filePath: string = null, piecewise: boolean = false, strict: boolean = false, outputMaps: boolean = false, simplificationMap: Record<string, string> = {}, importMap: Record<string, TemplateModule | string> = {}) : Promise<string | {output: string[], simplificationMap: Record<string, string>, importMap: Record<string, TemplateModule | string>}> => {
    const tree = GetTree(input);

    const state: LogimatTemplateState = {logimat: {files: []}};
    if(filePath) state.logimat.files = [filePath];

    if(!noFS && filePath) {
        module.paths.push(path.dirname(filePath));
    }

    const templates: Record<string, TemplateFunction> = {
        import: async (args, state1: LogimatTemplateState, context) => {
            if(noFS) throw new Error("Import failed: filesystem operations have been disabled.");
            if(context !== TemplateContext.OuterDeclaration) throw new Error("The import template can only be used outside of any methods!");
            if(args.length < 1 || typeof(args[0]) !== "string" || !args[0]) throw new Error("A path to the file to import must be defined!");

            const importPath = args[0];
            const realPath = path.isAbsolute(importPath) || state.logimat.files.length < 1 ? importPath : path.join(path.dirname(state.logimat.files[state.logimat.files.length-1]), importPath);

            //This uses a bit of "compiler magic". Basically, we use templates to keep track of files, but our template resolver doesn't actually mark
            //setFile as a template, so it will stop resolving templates once all templates that aren't setFile are gone. This way, the file boundaries will
            //persist, but won't create an infinite loop of template resolution.

            if(importMap.hasOwnProperty(realPath)) {
                const val = importMap[realPath];
                if(typeof(val) !== "string") throw new Error("Expected \"" + realPath + "\" to be a string but got \"" + typeof(val) + "\" instead.");

                return "setFile!(\"" + realPath + "\");" + val + "setFile!();";
            }

            const val = await readFile(realPath);
            importMap[realPath] = val;

            return "setFile!(\"" + realPath + "\");" + val + "setFile!();";
        },
        setFile: (args, state1: LogimatTemplateState, context) => {
            //If we have an argument, push it, otherwise remove the current path.
            if(typeof(args[0]) === "string") state1.logimat.files.push(args[0]);
            else state1.logimat.files.pop();

            return "";
        }
    };

    const postTemplates: string[] = [];

    for (const declaration of tree.imports) {
        if(noFS) throw new Error("Import failed: filesystem operations have been disabled.");

        if(declaration.importType === "template") {
            try {
                const module = importMap.hasOwnProperty(declaration.path) ? importMap[declaration.path] : require(declaration.path);
                if(!module?.hasOwnProperty("templates")) throw new Error("Module does not contain templates!");
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

    const templatesRef = {
        handledTemplates: true
    };
    let count = 0;

    let declarations: any[];

    try {
        declarations = await TraverseTemplatesArr(tree.declarations, templates, state, templatesRef);

        //Allow up to 50 layers of functions.
        while(templatesRef.handledTemplates && count < 50) {
            templatesRef.handledTemplates = false;
            declarations = await TraverseTemplatesArr(declarations, templates, state, templatesRef);

            count++;
        }

        declarations.push(...GetTree(postTemplates.join("\n")).declarations);

        //Reset variables.
        templatesRef.handledTemplates = true;
        count = 0;

        //Allow up to 50 layers of functions.
        while(templatesRef.handledTemplates && count < 50) {
            templatesRef.handledTemplates = false;
            declarations = await TraverseTemplatesArr(declarations, templates, state, templatesRef);

            count++;
        }
    } catch(e) {
        //Log the file the error occurred in, if it exists.
        if(state.logimat.files.length > 0) console.error("An error occurred in \"" + state.logimat.files[state.logimat.files.length-1] + "\":");
        throw e;
    }

    const inlines: Record<string, Inline> = {
        ...GetInlines(declarations),
        ...GetInlines(GetTree(stdlib).declarations),
        ...GetInlines(GetTree((piecewise ? piecewiseOps : ops)).declarations),
        ...GetInlines(piecewise ? [] : GetTree(nonPiecewiseOps).declarations)
    };

    const stack = [];

    try {
        const output = InternalCompile(useTex, declarations, inlines, templates, state, stack, strict, simplificationMap);

        if(outputMaps) return {...output, importMap};
        else return output.output.join("\n");
    } catch(e) {
        if(stack.length > 0) console.error("Call stack: " + stack.slice(0, Math.min(20, stack.length)).join(" -> "));
        throw e;
    }
}

const TraverseTemplatesArr = async (input: any[], templates: Record<string, TemplateFunction>, state: TemplateState, ref: {handledTemplates: boolean}) : Promise<any[]> => {
    const output: any[] = [];

    for (const val of input) {
        if(Array.isArray(val)) {
            output.push([...await TraverseTemplatesArr(val, templates, state, ref)]);
        } else if(typeof(val) === "object") {
            const newVal = await TraverseTemplatesObj(val, templates, state, ref);
            if(Array.isArray(newVal)) output.push(...newVal);
            else output.push(newVal);
        } else {
            output.push(val);
        }
    }

    return output;
}

const TraverseTemplatesObj = async (input: object, templates: Record<string, TemplateFunction>, state: TemplateState, ref: {handledTemplates: boolean}) : Promise<object | any[]> => {
    if(input == null) return null;

    if(input.hasOwnProperty("type") && ["template", "templatefunction"].includes(input["type"])) {
        return await HandleTemplate(<Template>input, templates, state, ref);
    }

    const output: object = {};

    for (const key in input) {
        const val = input[key];
        if(Array.isArray(val)) {
            output[key] = await TraverseTemplatesArr(val, templates, state, ref);
        } else if(typeof(val) === "object") {
            output[key] = await TraverseTemplatesObj(val, templates, state, ref);
        } else {
            output[key] = val;
        }
    }

    return output;
}

const HandleTemplate = async (templateDeclaration: Template, templates: Record<string, TemplateFunction>, state: TemplateState, ref: {handledTemplates: boolean}) : Promise<any[] | object> => {
    let output;

    if(templateDeclaration.type === "templatefunction") {
        // @ts-ignore
        output = templateDeclaration.function(state);

        ref.handledTemplates = true;
    } else {
        if(!templates.hasOwnProperty(templateDeclaration.name)) throw new Error("Template \"" + templateDeclaration.name + "\" does not exist!");

        try {
            output = await templates[templateDeclaration.name](templateDeclaration.args, state, templateDeclaration.context);
        } catch(e) {
            console.error("An error occurred while running the \"" + templateDeclaration.name + "\" template:");
            throw e;
        }

        //Ignore the setFile template. It's an internal template that returns itself in order to maintain file boundaries, but should not keep
        //template resolution from exiting. What this does is instead of handling the templates of the output, we simply return the template.
        //Doing this means that it will only be read until the next iteration.
        if(["setFile"].includes(templateDeclaration.name)) {
            return templateDeclaration;
        }

        ref.handledTemplates = true;
    }

    if(output instanceof Function) {
        return {type: "templatefunction", context: templateDeclaration.context, function: output};
    }

    //TODO: Allow templates to import other templates.

    switch(templateDeclaration.context) {
        case TemplateContext.OuterDeclaration:
            return await TraverseTemplatesArr(GetTree(output).declarations, templates, state, ref);
        case TemplateContext.InnerDeclaration:
            return await TraverseTemplatesArr(GetStatementsTree(output), templates, state, ref);
        case TemplateContext.Expression:
            const expr = GetExpression(output);
            if(typeof(expr) === "object") {
                return await TraverseTemplatesObj(expr, templates, state, ref);
            }

            return expr;
    }

    return [];
}

const InternalCompile = (useTex: boolean, tree: OuterDeclaration[], inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: TemplateState, stack: string[], strict: boolean, simplificationMap: Record<string, string> = {}) : {output: string[], simplificationMap: Record<string, string>} => {
    const out: string[] = [];
    const outerNames = GetDeclaredNames(tree);
    const display: Record<string, string> = {};

    for (const declaration of tree) {
        if (declaration.modifier === "inline") continue;

        const names = Object.assign([], outerNames);

        switch(declaration.type) {
            case "display":
                let val;
                if(typeof(declaration.value) === "string") val = declaration.value;
                else if(declaration.value.type === "tstring") val = declaration.value.args.map(arg => {
                    if(typeof(arg) === "string") return arg;
                    else return "${" + SimplifyExpression(CompileExpression(arg, inlines, templates, state, {}, stack, names), useTex, strict, names, simplificationMap) + "}";
                }).join("");
                else if(declaration.value.type === "aargs") val = declaration.value.name + "(" + declaration.value.args.map(arg => {
                    if(typeof(arg) === "string") return arg;
                    else return SimplifyExpression(CompileExpression(arg, inlines, templates, state, {}, stack, names), useTex, strict, names, simplificationMap);
                }).join(",") + ")";
                else val = SimplifyExpression(CompileExpression(declaration.value, inlines, templates, state, {}, stack, names), useTex, strict, names, simplificationMap);

                display[declaration.displayType] = val;
                break;
            case "function":
                out.push(...CompileDisplay(display));

                const functionDeclaration = <OuterFunctionDeclaration>declaration;
                out.push(HandleName(functionDeclaration.name) + "(" + functionDeclaration.args.map(HandleName).join(",") + ")" + "=" + SimplifyExpression(CompileBlock(functionDeclaration.block, inlines, templates, state, "", {}, {}, stack, names), useTex, strict, names.concat(functionDeclaration.args), simplificationMap));
                break;
            case "const":
                out.push(...CompileDisplay(display));

                const constDeclaration = <OuterConstDeclaration>declaration;
                out.push(HandleName(constDeclaration.name) + "=" + SimplifyExpression(CompileExpression(constDeclaration.expr, inlines, templates, state, {}, stack, names), useTex, strict, names, simplificationMap));
                break;
            case "action":
                const actionDeclaration = <ActionDeclaration>declaration;
                out.push((actionDeclaration.funcName ? HandleName(actionDeclaration.funcName) + (actionDeclaration.args ? "(" + actionDeclaration.args.map(HandleName).join(",") + ")" : "") + "=" : "") + HandleName(actionDeclaration.name) + "\\to " + SimplifyExpression(CompileBlock(actionDeclaration.block, inlines, templates, state, actionDeclaration.name, {}, {}, stack, names), useTex, strict, actionDeclaration.args ? names.concat(actionDeclaration.args) : names, simplificationMap));
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
                out.push(...CompileDisplay(display));

                const expressionDeclaration = <ExpressionDeclaration>declaration;
                out.push(SimplifyExpression(CompileBlock(expressionDeclaration.block, inlines, templates, state, "", {}, {}, stack, names), useTex, strict, names, simplificationMap));
                break;
            case "graph":
                out.push(...CompileDisplay(display));

                //Give the graph access to x and y.
                names.push("x", "y");

                const graphDeclaration = <GraphDeclaration>declaration;
                out.push(SimplifyExpression(CompileExpression(graphDeclaration.p1, inlines, templates, state, {}, stack, names), useTex, strict, names, simplificationMap) + opMap[graphDeclaration.op] + SimplifyExpression(CompileExpression(graphDeclaration.p2, inlines, templates, state, {}, stack, names), useTex, strict, names, simplificationMap));
                break;
            case "point":
                out.push(...CompileDisplay(display));

                const pointDeclaration = <PointDeclaration>declaration;
                out.push(SimplifyExpression(CompileExpression(pointDeclaration.point, inlines, templates, state, {}, stack, names), useTex, strict, names, simplificationMap));
                break;
            case "polygon":
                out.push(...CompileDisplay(display));

                const polygonDeclaration = <PolygonDeclaration>declaration;
                out.push("\\operatorname{polygon}" + (useTex ? "\\left(" : "(") + polygonDeclaration.points.map(point => SimplifyExpression(CompileExpression(point, inlines, templates, state, {}, stack, names), useTex, strict, names, simplificationMap)).join(",") + (useTex ? "\\right)" : ")"));
                break;
        }
    }

    return {output: out, simplificationMap};
}

const CompileDisplay = (input: Record<string, string>) => {
    const out = Object.entries(input).map(entry => "!" + entry[0] + "=" + entry[1]);

    //Clear the object.
    for(const key in input) {
        delete input[key];
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

    const args = expression.args.map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") && arg.hasOwnProperty("args") ? CompileExpression(<Expression>arg, inlines, templates, state, vars, stack, declaredNames) : arg);

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