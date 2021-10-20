import {
    Expression,
    grammar,
    ActionDeclaration,
    OuterConstDeclaration,
    OuterDeclaration,
    OuterFunctionDeclaration,
    ParserOutput,
    semantic,
    Statement,
    ExpressionDeclaration,
    ActionsDeclaration,
    Template,
    TemplateArgs
} from "./grammar";
import ops from "../libs/ops";
import stdlib from "../libs/stdlib";
import {SimplifyExpression} from "./simplify";

/**
 * Compiles LogiMat to a math function (or multiple). Each function/variable will be on a separate line.
 * @param input {string} - is the input LogiMat code that will be compiled.
 * @param useTex {boolean} - is a value indicating if the output should be converted to Tex.
 * @param noFS {boolean} - is a valid indicating if untrusted filesystem operations should be blocked (for example, code telling the compiler to load an NPM module). This is not a security feature.
 * @param filePath {string} - is a path to the file currently being compiled.
 */
export const Compile = (input: string, useTex: boolean = false, noFS = false, filePath: string = null) : string => {
    const tree = GetTree(input);

    const state: object = {};

    const templates: Record<string, TemplateFunction> = {};

    if(!noFS && typeof(filePath) === "string") {
        module.paths.push(filePath);
    }

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
            } catch(e) {
                console.error("An error occurred while loading module \"" + declaration.path + "\".");
                throw e;
            }
        }
    }

    const declarations = HandleOuterTemplates<OuterDeclaration>(tree.declarations, templates, state, false);

    const inlines: Record<string, Inline> = {
        ...GetInlines(declarations),
        ...GetInlines(GetTree(stdlib).declarations),
        ...GetInlines(GetTree(ops).declarations)
    };

    return InternalCompile(useTex, declarations, inlines, templates, state).join("\n");
}

const HandleOuterTemplates = <T extends OuterDeclaration | Statement>(inputDeclarations: T[], templates: Record<string, TemplateFunction>, state: object, statements: boolean) : T[] => {
    const declarations: T[] = [];

    let hasTemplates = false;

    for (const declaration of inputDeclarations) {
        if(declaration.type !== "template") {
            declarations.push(declaration);
            continue;
        }

        hasTemplates = true;

        const templateDeclaration = <Template>declaration;
        if(!templates.hasOwnProperty(templateDeclaration.name)) throw new Error("Template \"" + templateDeclaration.name + "\" does not exist!");

        const output = templates[templateDeclaration.name](templateDeclaration.args, state);
        const templateTree = statements ? GetStatementsTree(output) : GetTree(output);

        //TODO: Allow templates to import other templates.
        //@ts-ignore
        declarations.push(...(statements ? templateTree : templateTree.declarations));
    }

    //Keep handling templates until none are left.
    if(hasTemplates) return HandleOuterTemplates<T>(declarations, templates, state, statements);
    return declarations;
}

const InternalCompile = (useTex: boolean, tree: OuterDeclaration[], inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: object) : string[] => {
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
                out.push((actionDeclaration.funcName ? HandleName(actionDeclaration.funcName) + "=" : "") + HandleName(actionDeclaration.name) + "\\to " + SimplifyExpression(CompileBlock(actionDeclaration.block, inlines, templates, state), useTex));
                break;
            case "actions":
                const actionsDeclaration = <ActionsDeclaration>declaration;
                out.push(HandleName(actionsDeclaration.name) + "=" + actionsDeclaration.args.map(HandleName).join(","));
                break;
            case "expression":
                const expressionDeclaration = <ExpressionDeclaration>declaration;
                out.push(SimplifyExpression(CompileBlock(expressionDeclaration.block, inlines, templates, state), useTex));
                break;
        }
    }

    return out;
}

const HandleName = (name: string) : string => {
    //Correct the variable name if it's in the form of \w_\w+.
    if(name.substring(1, 2) === "_") {
        name = name[0] + "_{" + name.substring(2) + "}";
    }

    return name;
}

const GetTree = (input: string) : ParserOutput => {
    const match = grammar.match(input);
    if(match.failed()) throw new Error(match.message);

    return semantic(match).parse();
}

const GetStatementsTree = (input: string) : Statement[] => {
    const match = grammar.match(input, "InnerDeclarations");
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

const CompileBlock = (input: Statement[], inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: object, vars: Record<string, string> = {}, args: Record<string, string> = {}) : string => {
    let out = "";
    let newVars = {
        ...vars,
        ...args
    };

    const declarations: Statement[] = HandleOuterTemplates<Statement>(input, templates, state, true);

    for (const statement of declarations) {
        switch(statement.type) {
            case "const":
                newVars[statement["name"]] = CompileExpression(statement["expr"], inlines, templates, state, {
                    ...newVars,
                    state: out
                });

                break;
            case "state":
                out = CompileExpression(statement["expr"], inlines, templates, state, {
                    ...newVars,
                    state: out
                });
                break;
            case "if":
                const condition = CompileExpression(statement["condition"], inlines, templates, state, {
                    ...newVars,
                    state: out
                });
                const ifaction = CompileBlock(statement["ifaction"], inlines, templates, state, {
                    ...newVars,
                    state: out
                });
                const elseaction = CompileBlock(statement["elseaction"], inlines, templates, state, {
                    ...newVars,
                    state: out
                });


                out = CompileExpression({type: "f", args: ["if_func", [condition, ifaction, elseaction]]}, inlines, templates, state, {
                    ...newVars,
                    state: out
                });
                break;
        }
    }

    if(out === "") throw new Error("The state must be set inside of every block.");
    return out;
}

const CompileExpression = (expression: Expression, inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: object, vars: Record<string, string> = {}) : string => {
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

            return CompileBlock((<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).block, inlines, templates, state, vars, Object.fromEntries(fargnames.map((v, i) => [v, fargs[i]])));
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
            return "sum(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, templates, state, vars) + ")";
        case "prod":
            return "prod(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, templates, state, vars) + ")";
    }

    return "";
}

interface Inline {
    function: boolean;
    value: OuterDeclaration;
}

type TemplateFunction = (args: TemplateArgs, state: object) => string;