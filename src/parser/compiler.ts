import {
    Expression,
    grammar,
    ActionDeclaration,
    OuterConstDeclaration,
    OuterDeclaration,
    OuterFunctionDeclaration,
    ParserOutput,
    semantic,
    Statement, CalculationDeclaration, ActionsDeclaration
} from "./grammar";
import ops from "../libs/ops";
import stdlib from "../libs/stdlib";
import {SimplifyExpression} from "./simplify";

/**
 * Compiles LogiMat to a math function (or multiple). Each function/variable will be on a separate line.
 * @param input {string} - is the input LogiMat code that will be compiled.
 * @param useTex {boolean} - is a value indicating if the output should be converted to Tex.
 */
export const Compile = (input: string, useTex: boolean = false) : string => {
    const tree = GetTree(input);

    let out: string[] = [];

    const inlines: Record<string, Inline> = {
        ...GetInlines(tree),
        ...GetInlines(GetTree(stdlib)),
        ...GetInlines(GetTree(ops))
    };

    for (const declaration of tree) {
        if (declaration.modifier === "inline") continue;

        switch(declaration.type) {
            case "function":
                const functionDeclaration = <OuterFunctionDeclaration>declaration;
                out.push(HandleName(functionDeclaration.name) + "(" + functionDeclaration.args.join(",") + ")" + "=" + SimplifyExpression(CompileBlock(functionDeclaration.block, inlines), useTex));
                break;
            case "const":
                const constDeclaration = <OuterConstDeclaration>declaration;
                out.push(HandleName(constDeclaration.name) + "=" + SimplifyExpression(CompileExpression(constDeclaration.expr, inlines), useTex));
                break;
            case "action":
                const actionDeclaration = <ActionDeclaration>declaration;
                out.push((actionDeclaration.funcName ? HandleName(actionDeclaration.funcName) + "=" : "") + HandleName(actionDeclaration.name) + "\\to " + SimplifyExpression(CompileBlock(actionDeclaration.block, inlines), useTex));
                break;
            case "actions":
                const actionsDeclaration = <ActionsDeclaration>declaration;
                out.push(HandleName(actionsDeclaration.name) + "=" + actionsDeclaration.args.map(HandleName).join(","));
                break;
            case "calculation":
                const calculationDeclaration = <CalculationDeclaration>declaration;
                out.push(SimplifyExpression(CompileBlock(calculationDeclaration.block, inlines), useTex));
                break;
        }
    }

    return out.join("\n");
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

const GetInlines = (tree: ParserOutput) : Record<string, Inline> => {
    const inlines: Record<string, Inline> = {};

    for (const declaration of tree) {
        if(declaration.modifier === "inline") inlines[declaration["name"]] = {function: declaration.type === "function", value: declaration};
    }

    return inlines;
}

const CompileBlock = (input: Statement[], inlines: Record<string, Inline>, vars: Record<string, string> = {}, args: Record<string, string> = {}) : string => {
    let out = "";
    let newVars = {
        ...vars,
        ...args
    };

    for (const statement of input) {
        switch(statement.type) {
            case "const":
                newVars[statement["name"]] = CompileExpression(statement["expr"], inlines, {
                    ...newVars,
                    state: out
                });

                break;
            case "state":
                out = CompileExpression(statement["expr"], inlines, {
                    ...newVars,
                    state: out
                });
                break;
            case "if":
                const condition = CompileExpression(statement["condition"], inlines, {
                    ...newVars,
                    state: out
                });
                const ifaction = CompileBlock(statement["ifaction"], inlines, {
                    ...newVars,
                    state: out
                });
                const elseaction = CompileBlock(statement["elseaction"], inlines, {
                    ...newVars,
                    state: out
                });


                out = CompileExpression({type: "f", args: ["if_func", [condition, ifaction, elseaction]]}, inlines, {
                    ...newVars,
                    state: out
                });
                break;
        }
    }

    if(out === "") throw new Error("The state must be set inside of every block.");
    return out;
}

const CompileExpression = (expression: Expression, inlines: Record<string, Inline>, vars: Record<string, string> = {}) : string => {
    if(typeof(expression) !== "object") return expression;

    const args = expression.args.map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, inlines, vars) : arg);

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
            const fargs = (<any[]>expression.args[1]).map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, inlines, vars) : arg);

            if(!inlines.hasOwnProperty(<string>expression.args[0])) return <string>expression.args[0] + "(" + fargs.join(",") + ")";

            const fargnames = (<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).args;

            if(fargnames.length !== fargs.length) throw new Error("Inline function \"" + expression.args[0] + "\" requires " + fargnames.length + ", but only " + fargs.length + " are given.");

            return CompileBlock((<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).block, inlines, vars, Object.fromEntries(fargnames.map((v, i) => [v, fargs[i]])));
        case "v":
            const name = <string>expression.args[0];

            if(vars.hasOwnProperty(name)) return vars[name];
            if(inlines.hasOwnProperty(name)) return CompileExpression(inlines[name].value["expr"], inlines, vars);

            switch(name) {
                case "pi":
                    return "pi()";
            }

            return name;
        case "sum":
            return "sum(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, vars) + ")";
        case "prod":
            return "prod(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, vars) + ")";
    }

    return "";
}

interface Inline {
    function: boolean;
    value: OuterDeclaration;
}