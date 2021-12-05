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

/**
 * Compiles LogiMat to a math function (or multiple). Each function/variable will be on a separate line.
 * @param input {string} - is the input LogiMat code that will be compiled.
 * @param useTex {boolean} - is a value indicating if the output should be converted to Tex.
 * @param noFS {boolean} - is a valid indicating if untrusted filesystem operations should be blocked (for example, code telling the compiler to load an NPM module). This is not a security feature.
 * @param filePath {string} - is a path to the file currently being compiled.
 */
export const Compile = (input: string, useTex: boolean = false, noFS = false, filePath: string = null) : string => {
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
        ...GetInlines(GetTree(ops).declarations)
    };

    return InternalCompile(useTex, declarations, inlines, templates, state).join("\n");
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

const InternalCompile = (useTex: boolean, tree: OuterDeclaration[], inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: TemplateState) : string[] => {
    let out: string[] = [];

    for (const declaration of tree) {
        if (declaration.modifier === "inline") continue;

        switch(declaration.type) {
            case "function":
                const functionDeclaration = <OuterFunctionDeclaration>declaration;
                out.push(HandleName(functionDeclaration.name) + "(" + functionDeclaration.args.map(HandleName).join(",") + ")" + "=" + SimplifyExpression(CompileBlock(functionDeclaration.block, inlines, templates, state), useTex));
                break;
            case "const":
                const constDeclaration = <OuterConstDeclaration>declaration;
                out.push(HandleName(constDeclaration.name) + "=" + SimplifyExpression(CompileExpression(constDeclaration.expr, inlines, templates, state), useTex));
                break;
            case "action":
                const actionDeclaration = <ActionDeclaration>declaration;
                out.push((actionDeclaration.funcName ? HandleName(actionDeclaration.funcName) + "=" : "") + HandleName(actionDeclaration.name) + "\\to " + SimplifyExpression(CompileBlock(actionDeclaration.block, inlines, templates, state, actionDeclaration.name), useTex));
                break;
            case "actions":
                const actionsDeclaration = <ActionsDeclaration>declaration;
                out.push(HandleName(actionsDeclaration.name) + "=" + actionsDeclaration.args.map(HandleName).join(","));
                break;
            case "expression":
                const expressionDeclaration = <ExpressionDeclaration>declaration;
                out.push(SimplifyExpression(CompileBlock(expressionDeclaration.block, inlines, templates, state), useTex));
                break;
            case "graph":
                const opMap = {
                    "=": "=",
                    ">": ">",
                    ">=": "\\ge ",
                    "=>": "\\ge ",
                    "<=": "\\le ",
                    "=<": "\\le "
                };

                const graphDeclaration = <GraphDeclaration>declaration;
                out.push(SimplifyExpression(CompileExpression(graphDeclaration.p1, inlines, templates, state), useTex) + opMap[graphDeclaration.op] + SimplifyExpression(CompileExpression(graphDeclaration.p2, inlines, templates, state), useTex));
                break;
            case "point":
                const pointDeclaration = <PointDeclaration>declaration;
                out.push((useTex ? "\\left(" : "(") + SimplifyExpression(CompileExpression(pointDeclaration.p1, inlines, templates, state), useTex) + "," + SimplifyExpression(CompileExpression(pointDeclaration.p2, inlines, templates, state), useTex) + (useTex ? "\\right)" : ")"));
                break;
        }
    }

    return out;
}

const HandleName = (name: string) : string => {
    //Correct the variable name if it's in the form of \w_\w+.
    if(name.substring(1, 2) === "_") {
        name = name[0] + "_{" + name.substring(2).replace(/_/g, "") + "}";
    }

    return name.replace(/_/g, "");
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

const CompileBlock = (input: Statement[], inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: TemplateState, defaultOut = "", vars: Record<string, string> = {}, args: Record<string, string> = {}) : string => {
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
                });

                break;
            case "state":
                out = CompileExpression(statement["expr"], inlines, templates, state, {
                    ...newVars,
                    state: out || vars["state"] || ""
                });
                break;
            case "if":
                if(!statement["elseaction"] && !out) {
                    throw new Error("The state must be set before an else-less if can be used.");
                }

                const condition = CompileExpression(statement["condition"], inlines, templates, state, {
                    ...newVars,
                    state: out
                });
                const ifaction = CompileBlock(statement["ifaction"], inlines, templates, state, out, {
                    ...newVars,
                    state: out
                });
                const elseaction = statement["elseaction"] ? CompileBlock(statement["elseaction"], inlines, templates, state, out, {
                    ...newVars,
                    state: out
                }) : out;


                out = CompileExpression({type: "f", args: ["if_func", [condition, ifaction, elseaction]]}, inlines, templates, state, {
                    ...newVars,
                    state: out || vars["state"] || ""
                });
                break;
        }
    }

    if(out === "") throw new Error("The state must be set inside of every block.");
    return out;
}

const CompileExpression = (expression: Expression, inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: TemplateState, vars: Record<string, string> = {}) : string => {
    if(typeof(expression) !== "object") return expression;

    if(typeof(expression) !== "object") return expression;

    const args = expression.args.map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, inlines, templates, state, vars) : arg);

    switch(expression.type){
        case "+":
            return "(" + args[0] + ")+(" + args[1] + ")";
        case "-":
            return "(" + args[0] + ")-(" + args[1] + ")";
        case "*":
            return "(" + args[0] + ")*(" + args[1] + ")";
        case "/":
            return "div(" + args[0] + "," + args[1] + ")";
        case "^":
            return "pow(" + args[0] + "," + args[1] + ")";
        case "n":
            return "-(" + args[0] + ")";
        case "f":
            const fargs = (<any[]>expression.args[1]).map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, inlines, templates, state, vars) : arg);

            if(!inlines.hasOwnProperty(<string>expression.args[0])) return <string>expression.args[0] + "(" + fargs.join(",") + ")";

            const fargnames = (<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).args;

            if(fargnames.length !== fargs.length) throw new Error("Inline function \"" + expression.args[0] + "\" requires " + fargnames.length + ", but only " + fargs.length + " are given.");

            return CompileBlock((<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).block, inlines, templates, state, "", vars, Object.fromEntries(fargnames.map((v, i) => [v, fargs[i]])));
        case "v":
            const name = <string>expression.args[0];

            if(vars.hasOwnProperty(name)) return vars[name];
            if(inlines.hasOwnProperty(name)) return CompileExpression(inlines[name].value["expr"], inlines, templates, state, vars);

            switch(name) {
                case "pi":
                    return "pi()";
            }

            return name;
        case "sum":
            return "sum(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, templates, state, "", vars) + ")";
        case "prod":
            return "prod(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, templates, state, "", vars) + ")";
    }

    return "";
}

interface Inline {
    function: boolean;
    value: OuterDeclaration;
}