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
import {TemplateArg, TemplateArgs, TemplateContext, TemplateFunction, TemplateModule, TemplateState} from "../types";
import path from "path";
import * as fs from "fs";
import {HandleName, isNumeric, opMap} from "./util";
import piecewiseOps from "../libs/piecewiseOps";

const readFile = (path: string) => new Promise<string>((resolve, reject) => {
    fs.readFile(path, (err, val) => {
        if(err) return reject(err);
        resolve(val.toString());
    });
});

interface LogimatTemplateState {
    logimat: {
        files: string[],
        definitions: Record<string, TemplateArg>
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

    const state: LogimatTemplateState = {logimat: {files: [], definitions: {}}};
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
        setfile: (args, state1: LogimatTemplateState, context) => {
            //If we have an argument, push it, otherwise remove the current path.
            if(typeof(args[0]) === "string") state1.logimat.files.push(args[0]);
            else state1.logimat.files.pop();

            return "";
        },
        iterate: (args, state1: LogimatTemplateState, context) => {
            if(args.length < 1 || typeof(args[0]) !== "object" || !args[0]["block"]) throw new Error("A block to iterate is required!");
            if(args.length < 2 || typeof(args[1]) !== "number" || isNaN(args[1]) || args[1] < 1) throw new Error("A number specifying the number of times to iterate is required!");

            let output = "";

            if(args.length > 2 && typeof(args[2]) === "boolean" && args[2]) {
                output += "[";

                for(let i = 0; i < args[1]; i++) {
                    output += "{" + args[0]["value"] + "}";
                    if(i !== args[1]-1) output += ",\n";
                }

                output += "]";
            } else {
                if(context === TemplateContext.Expression) throw new Error("In order to use iterate inside of expressions, you must set it to output an array (by setting the third argument to \"true\").");

                for(let i = 0; i < args[1]; i++) {
                    output += args[0]["value"];
                    if(i !== args[1]-1) output += "\n";
                }
            }

            return output;
        },
        define: (args, state1: LogimatTemplateState, context) => {
            if(context === TemplateContext.Expression) throw new Error("This template cannot be ran outside of an expression!");
            if(args.length < 1 || typeof(args[0]) !== "string" || !args[0]) throw new Error("A name is required!");
            if(args.length < 2) throw new Error("A value is required!");

            state1.logimat.definitions[args[0]] = args[1];

            return "";
        },
        get: (args, state1: LogimatTemplateState, context) => {
            if(context !== TemplateContext.Expression) throw new Error("This template cannot be ran outside of an expression!");
            if(args.length < 1 || typeof(args[0]) !== "number") throw new Error("A name is required!");

            return args[0].toString();
        },
        concat: (args, state1: LogimatTemplateState, context) => {
            if(context !== TemplateContext.Expression) throw new Error("This template cannot be ran outside of an expression!");

            let result = "";

            for(const part of args) {
                if(typeof(part) !== "string" && typeof(part) !== "number") throw new Error("This template can only be used with strings and numbers!");
                result += part;
            }

            return result;
        },
        if: (args, state1: LogimatTemplateState, context) => {
            if(context === TemplateContext.Expression) throw new Error("This template cannot be ran inside of an expression!");
            if(args.length < 1 || (typeof(args[0]) !== "boolean" && typeof(args[0]) !== "number" && typeof(args[0]) !== "string")) throw new Error("A condition is required!");
            if(args.length < 2 || typeof(args[1]) !== "object" || !args[1]["block"]) throw new Error("An if action is required!");

            if(args[0] === true || args[0] === 1 || args[0] === "1") {
                return args[1]["value"];
            }

            if(args.length > 2 && typeof(args[2]) === "object" && args[2]["block"]) return args[2]["value"];
            return "";
        },
        parse: (args, state1: LogimatTemplateState, context) => {
            if(context !== TemplateContext.Expression) throw new Error("This template can only be ran inside of an expression!");
            if(args.length < 1 || typeof(args[0]) !== "string" || !args[0]) throw new Error("A value to parse is required!");

            return HandleName(args[0]);
        },
        wrap: (args, state1: LogimatTemplateState, context) => {
            if(context !== TemplateContext.Expression) throw new Error("This template can only be ran inside of an expression!");
            if(args.length < 1 || typeof(args[0]) !== "string" || !args[0]) throw new Error("A value to wrap is required!");

            return "${" + args[0] + "}";
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

                    templates[templateKey.trim().toLowerCase()] = template.function;
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
        declarations = await TraverseTemplatesArr(tree.declarations, templates, state, templatesRef, simplificationMap);

        //Allow up to 50 layers of functions.
        while(templatesRef.handledTemplates && count < 50) {
            templatesRef.handledTemplates = false;
            declarations = await TraverseTemplatesArr(declarations, templates, state, templatesRef, simplificationMap);

            count++;
        }

        declarations.push(...GetTree(postTemplates.join("\n")).declarations);

        //Reset variables.
        templatesRef.handledTemplates = true;
        count = 0;

        //Allow up to 50 layers of functions.
        while(templatesRef.handledTemplates && count < 50) {
            templatesRef.handledTemplates = false;
            declarations = await TraverseTemplatesArr(declarations, templates, state, templatesRef, simplificationMap);

            count++;
        }
    } catch(e) {
        //Log the file the error occurred in, if it exists.
        if(state.logimat.files.length > 0) console.error("An error occurred in \"" + state.logimat.files[state.logimat.files.length-1] + "\":");
        throw e;
    }

    // Next, we want to handle export declarations. Exports work by creating an export with a random name, along with the contents
    // of the inline specified by the export. Next, the original inline's contents are changed to point to the new export.
    const fileInlines = GetInlines(declarations);
    const stdLibInlines = GetInlines(GetTree(stdlib).declarations);
    const opsInlines = GetInlines(GetTree((piecewise ? piecewiseOps : ops)).declarations);

    const exportInlines = {
        ...fileInlines,
        ...stdLibInlines,
        ...opsInlines
    };

    const exportDeclarations = [];

    let varIdx = 1;

    for (const exportName of GetExportDeclarations(declarations)) {
        // This exportName is the name of an inline.
        // First, we should look up the inline.
        const inline = exportInlines[exportName];

        // If it doesn't exist, no need to proceed.
        if(!inline) continue;

        // Now, let's create a variable for the new export.
        const name = "v_" + varIdx++;

        // Remove the value from declarations.
        const idx = declarations.indexOf(inline.value);
        if(idx !== -1) declarations.splice(idx, 1);

        if(inline.function) {
            // Create an export function.
            const exportFunction = (inline.value as OuterFunctionDeclaration);

            const inlineName = exportFunction.name;
            exportFunction.name = name;
            exportFunction.modifier = "export";

            // Create args which are the length of the original's args.
            const inlineArgs = [...exportFunction.args];
            exportFunction.args = Array(inlineArgs.length).fill("").map(() => "v_" + varIdx++);

            // Finally, we to insert something to map between the old and new names.
            const maps: Statement[] = inlineArgs.map((inlineArg, idx) => {
                const exportArg = exportFunction.args[idx];

                return {
                    type: "const",
                    name: inlineArg,
                    expr: {
                        type: "v",
                        args: [exportArg]
                    }
                }
            });
            exportFunction.block.unshift(...maps);

            // Create an inline function.
            const inlineFunction: OuterFunctionDeclaration = {
                type: "function",
                modifier: "inline",
                name: inlineName,
                args: inlineArgs,
                block: [
                    {
                        type: "state",
                        expr: {
                            type: "f",
                            args: [
                                name,
                                inlineArgs.map(arg => ({
                                    type: "v",
                                    args: [
                                        arg
                                    ]
                                }))
                            ]
                        }
                    }
                ]
            };

            // Add the new functions to declarations.
            declarations.push(exportFunction);
            exportDeclarations.push(inlineFunction);
        } else {
            // Create an export const.
            const exportConst = (inline.value as OuterConstDeclaration);

            const inlineName = exportConst.name;
            exportConst.name = name;
            exportConst.modifier = "export";

            // Create an inline const.
            const inlineConst: OuterConstDeclaration = {
                type: "const",
                modifier: "inline",
                name: inlineName,
                expr: {
                    type: "v",
                    args: [
                        name
                    ]
                }
            };

            // Add the new functions to declarations.
            declarations.push(exportConst);
            exportDeclarations.push(inlineConst);
        }
    }

    // We need to run GetInlines again because declarations is changed.
    const inlines: Record<string, Inline> = {
        ...GetInlines(declarations),
        ...stdLibInlines,
        ...opsInlines,
        ...GetInlines(exportDeclarations)
    };

    const stack = [];

    try {
        const output = InternalCompile(useTex, declarations, inlines, templates, state, varIdx, stack, strict, simplificationMap);

        if(outputMaps) return {...output, importMap};
        else return output.output.join("\n");
    } catch(e) {
        if(stack.length > 0) console.error("Call stack: " + stack.slice(0, Math.min(20, stack.length)).join(" -> "));
        throw e;
    }
}

const TraverseTemplatesArr = async (input: any[], templates: Record<string, TemplateFunction>, state: LogimatTemplateState, ref: {handledTemplates: boolean}, simplificationMap: Record<string, string>) : Promise<any[]> => {
    const output: any[] = [];

    for (const val of input) {
        if(Array.isArray(val)) {
            output.push([...await TraverseTemplatesArr(val, templates, state, ref, simplificationMap)]);
        } else if(typeof(val) === "object") {
            const newVal = await TraverseTemplatesObj(val, templates, state, ref, simplificationMap);
            if(Array.isArray(newVal)) output.push(...newVal);
            else output.push(newVal);
        } else {
            output.push(val);
        }
    }

    return output;
}

const TraverseTemplatesObj = async (input: object, templates: Record<string, TemplateFunction>, state: LogimatTemplateState, ref: {handledTemplates: boolean}, simplificationMap: Record<string, string>) : Promise<object | any[]> => {
    if(input == null) return null;

    if(input.hasOwnProperty("type") && ["template", "templatefunction"].includes(input["type"])) {
        return await HandleTemplate(<Template>input, templates, state, ref, simplificationMap);
    }

    const output: object = {};

    for (const key in input) {
        const val = input[key];
        if(Array.isArray(val)) {
            output[key] = await TraverseTemplatesArr(val, templates, state, ref, simplificationMap);
        } else if(typeof(val) === "object") {
            output[key] = await TraverseTemplatesObj(val, templates, state, ref, simplificationMap);
        } else {
            output[key] = val;
        }
    }

    return output;
}

const HandleTemplate = async (templateDeclaration: Template, templates: Record<string, TemplateFunction>, state: LogimatTemplateState, ref: {handledTemplates: boolean}, simplificationMap: Record<string, string>) : Promise<any[] | object> => {
    let output;

    const name = templateDeclaration.name?.trim()?.toLowerCase();

    if(templateDeclaration.type === "templatefunction") {
        // @ts-ignore
        output = templateDeclaration.function(state);

        ref.handledTemplates = true;
    } else {
        if(!templates.hasOwnProperty(name)) throw new Error("Template \"" + templateDeclaration.name + "\" does not exist!");

        try {
            //Handle expressions in the template args.
            const templateArgs: TemplateArgs = [];

            for(const arg of templateDeclaration.args) {
                if(arg && arg["expression"]) {
                    const definedNames = Object.keys(state.logimat.definitions).filter(key => typeof(state.logimat.definitions[key]) === "number");

                    const handled = await TraverseTemplatesObj(arg["value"], templates, state, ref, simplificationMap);

                    //Handle special cases like raw numbers and non-numerical definitions.
                    if(handled.hasOwnProperty("type")) {
                        if(handled["type"] === "v" && handled["args"] && state.logimat.definitions.hasOwnProperty(handled["args"][0])) {
                            templateArgs.push(state.logimat.definitions[handled["args"][0]]);
                            continue;
                        }
                    } else {
                        const value = Object.values(handled).join("");

                        if(!isNumeric(value)) {
                            if(arg["nonStrict"] && typeof(handled) === "string") {
                                templateArgs.push(handled);
                                continue;
                            }

                            throw new Error("The input \"" + arg["source"] + "\" cannot be evaluated to a number. Expressions input into templates must evaluate to numbers, and can only use defined variables.");
                        }
                        templateArgs.push(parseFloat(value));
                        continue;
                    }

                    const compiled = CompileExpression(handled as Expression, {
                        inlines: {},
                        varIdx: {value: 0},
                        names: definedNames,
                        stack: [],
                        state,
                        templates,
                        vars: Object.fromEntries(Object.entries(state.logimat.definitions).filter(([key, value]) => typeof(value) === "number")) as Record<string, string>
                    });

                    const simplified = SimplifyExpression(compiled, false, !arg["nonStrict"], definedNames, simplificationMap);

                    if(!isNumeric(simplified)) {
                        if(arg["nonStrict"]) {
                            templateArgs.push(simplified);
                            continue;
                        }

                        throw new Error("The input \"" + arg["source"] + "\" cannot be evaluated to a number. Expressions input into templates must evaluate to numbers, and can only use defined variables.");
                    }

                    templateArgs.push(parseFloat(simplified));
                    continue;
                } else if(typeof(arg) === "object") {
                    templateArgs.push(await TraverseTemplatesObj(arg, templates, state, ref, simplificationMap) as TemplateArg);
                    continue;
                }

                templateArgs.push(arg as TemplateArg);
            }

            output = await templates[name](templateArgs, state, templateDeclaration.context);
        } catch(e) {
            console.error("An error occurred while running the \"" + templateDeclaration.name + "\" template:");
            throw e;
        }

        //Ignore the setFile template. It's an internal template that returns itself in order to maintain file boundaries, but should not keep
        //template resolution from exiting. What this does is instead of handling the templates of the output, we simply return the template.
        //Doing this means that it will only be read until the next iteration.
        if(["setfile"].includes(name)) {
            return templateDeclaration;
        }

        ref.handledTemplates = true;
    }

    if(output instanceof Function) {
        return {type: "templatefunction", context: templateDeclaration.context, function: output};
    }

    if(["concat", "parse", "wrap"].includes(name)) return output;

    //TODO: Allow templates to import other templates.

    switch(templateDeclaration.context) {
        case TemplateContext.OuterDeclaration:
            return await TraverseTemplatesArr(GetTree(output).declarations, templates, state, ref, simplificationMap);
        case TemplateContext.InnerDeclaration:
            return await TraverseTemplatesArr(GetStatementsTree(output), templates, state, ref, simplificationMap);
        case TemplateContext.Expression:
            const expr = GetExpression(output);
            if(typeof(expr) === "object") {
                return await TraverseTemplatesObj(expr, templates, state, ref, simplificationMap);
            }

            return expr;
    }

    return [];
}

const InternalCompile = (useTex: boolean, tree: OuterDeclaration[], inlines: Record<string, Inline>, templates: Record<string, TemplateFunction>, state: TemplateState, varIdx: number, stack: string[], strict: boolean, simplificationMap: Record<string, string> = {}) : {output: string[], simplificationMap: Record<string, string>} => {
    const out: string[] = [];
    const outerNames = GetDeclaredNames(tree);
    const display: Record<string, string> = {};

    let data: CompileData = {inlines, templates, state, stack, names: [], vars: {}, varIdx: {value: varIdx}};

    for (const declaration of tree) {
        if (declaration.modifier === "inline") continue;

        const names = Object.assign([], outerNames);

        data = {
            inlines,
            templates,
            state,
            stack,
            names,
            vars: {},
            varIdx: data.varIdx
        };

        switch(declaration.type) {
            case "display":
                let val;
                if(typeof(declaration.value) === "string") val = declaration.value;
                else if(declaration.value.type === "tstring") val = declaration.value.args.map(arg => {
                    if(typeof(arg) === "string") return arg;
                    else return "${" + SimplifyExpression(CompileExpression(arg, data), useTex, strict, names, simplificationMap) + "}";
                }).join("");
                else if(declaration.value.type === "aargs") val = HandleName(declaration.value.name) + "(" + declaration.value.args.map(arg => {
                    if(typeof(arg) === "string") {
                        if(arg === "index") return "\\operatorname{index}";
                        return arg;
                    }
                    else return SimplifyExpression(CompileExpression(arg, data), useTex, strict, names, simplificationMap);
                }).join(",") + ")";
                else val = SimplifyExpression(CompileExpression(declaration.value, data), useTex, strict, names, simplificationMap);

                display[declaration.displayType] = val;
                break;
            case "function":
                out.push(...CompileDisplay(display));

                const functionDeclaration = <OuterFunctionDeclaration>declaration;
                out.push(HandleName(functionDeclaration.name) + "(" + functionDeclaration.args.map(HandleName).join(",") + ")" + "=" + SimplifyExpression(CompileBlock(functionDeclaration.block, data, "", {}), useTex, strict, names.concat(functionDeclaration.args), simplificationMap));
                break;
            case "const":
                out.push(...CompileDisplay(display));

                const constDeclaration = <OuterConstDeclaration>declaration;
                out.push(HandleName(constDeclaration.name) + "=" + SimplifyExpression(CompileExpression(constDeclaration.expr, data), useTex, strict, names, simplificationMap));
                break;
            case "action":
                const actionDeclaration = <ActionDeclaration>declaration;
                out.push((actionDeclaration.funcName ? HandleName(actionDeclaration.funcName) + (actionDeclaration.args ? "(" + actionDeclaration.args.map(HandleName).join(",") + ")" : "") + "=" : "") + HandleName(actionDeclaration.name) + "\\to " + SimplifyExpression(CompileBlock(actionDeclaration.block, data, "", {}), useTex, strict, actionDeclaration.args ? names.concat(actionDeclaration.args) : names, simplificationMap));
                break;
            case "actions":
                const actionsDeclaration = <ActionsDeclaration>declaration;

                //Get the name without the args (the first part before the opening parenthesis)
                const badActions = actionsDeclaration.args.filter(action => !names.includes(action[0]));
                if(strict && badActions.length > 0) {
                    throw new Error("The following actions have not been defined: " + badActions.map(action => "\"" + action[0] + "\"").join(", ") + ".");
                }

                out.push(HandleName(actionsDeclaration.name) + (actionsDeclaration.actionArgs ? "(" + actionsDeclaration.actionArgs.map(HandleName).join(",") + ")" : "") + "=" + actionsDeclaration.args.map(action => HandleName(action[0]) + (action.length > 1 ? "(" + action.slice(1).map(HandleName) + ")" : "")).join(","));
                break;
            case "expression":
                out.push(...CompileDisplay(display));

                const expressionDeclaration = <ExpressionDeclaration>declaration;
                out.push(SimplifyExpression(CompileBlock(expressionDeclaration.block, data, "", {}), useTex, strict, names, simplificationMap));
                break;
            case "graph":
                out.push(...CompileDisplay(display));

                //Give the graph access to x and y.
                names.push("x", "y");

                const graphDeclaration = <GraphDeclaration>declaration;
                out.push(SimplifyExpression(CompileExpression(graphDeclaration.p1, data), useTex, strict, names, simplificationMap) + opMap[graphDeclaration.op] + SimplifyExpression(CompileExpression(graphDeclaration.p2, data), useTex, strict, names, simplificationMap));
                break;
            case "point":
                out.push(...CompileDisplay(display));

                const pointDeclaration = <PointDeclaration>declaration;
                out.push(SimplifyExpression(CompileExpression(pointDeclaration.point, data), useTex, strict, names, simplificationMap));
                break;
            case "polygon":
                out.push(...CompileDisplay(display));

                const polygonDeclaration = <PolygonDeclaration>declaration;
                out.push("\\operatorname{polygon}" + (useTex ? "\\left(" : "(") + polygonDeclaration.points.map(point => SimplifyExpression(CompileExpression(point, data), useTex, strict, names, simplificationMap)).join(",") + (useTex ? "\\right)" : ")"));
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

const GetExportDeclarations = (tree: OuterDeclaration[]) : string[] => {
    const exports: string[] = [];

    for (const declaration of tree) {
        if(declaration.type === "export" && !exports.includes(declaration.name)) exports.push(declaration.name);
    }

    return exports;
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

const CompileBlock = (input: Statement[], data: CompileData, defaultOut: string, args: Record<string, string>) : string => {
    let out = defaultOut;
    let newVars = {
        ...data.vars,
        ...args
    };

    for (const statement of input) {
        switch(statement.type) {
            case "const":
                newVars[statement["name"]] = CompileExpression(statement["expr"], {
                    ...data,
                    vars: {
                        ...newVars,
                        state: out || data.vars["state"] || ""
                    }
                });

                break;
            case "state":
                out = CompileExpression(statement["expr"], {
                    ...data,
                    vars: {
                        ...newVars,
                        state: out || data.vars["state"] || ""
                    }
                });
                break;
            case "if":
                if(!statement["elseaction"] && !out) {
                    throw new Error("The state must be set before an else-less if can be used.");
                }

                const condition = CompileExpression(statement["condition"], {
                    ...data,
                    vars: {
                        ...newVars,
                        state: out
                    }
                });
                const ifaction = CompileBlock(statement["ifaction"], {
                    ...data,
                    vars: {
                        ...newVars,
                        state: out
                    }
                }, out, {});
                const elseaction = statement["elseaction"] ? CompileBlock(statement["elseaction"], {
                    ...data,
                    vars: {
                        ...newVars,
                        state: out
                    }
                }, out, {}) : out;

                out = CompileExpression({type: "f", args: ["if_func", [condition, ifaction, elseaction]]}, {
                    ...data,
                    vars: {
                        ...newVars,
                        state: out || data.vars["state"] || ""
                    }
                });
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

const CompileExpression = (expression: Expression, data: CompileData) : string => {
    if(typeof(expression) !== "object") return expression;

    const args = expression.args.map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") && arg.hasOwnProperty("args") ? CompileExpression(<Expression>arg, data) : arg);

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
            const fargs = (<any[]>expression.args[1]).map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, data) : arg);

            if(!data.inlines.hasOwnProperty(<string>expression.args[0])) {
                if(piecewiseFunctions.includes(<string>expression.args[0])) return HandlePiecewise(<string>expression.args[0], fargs);
                return <string>expression.args[0] + "(" + fargs.join(",") + ")";
            }

            const fargnames = (<OuterFunctionDeclaration>data.inlines[<string>expression.args[0]].value).args;

            if(fargnames.length !== fargs.length) throw new Error("Inline function \"" + expression.args[0] + "\" requires " + fargnames.length + ", but only " + fargs.length + " are given.");

            data.stack.push(<string>expression.args[0]);
            const result = CompileBlock((<OuterFunctionDeclaration>data.inlines[<string>expression.args[0]].value).block, data, "", Object.fromEntries(fargnames.map((v, i) => [v, fargs[i]])));
            data.stack.pop();

            return "(" + result + ")";
        case "v":
            const name = <string>expression.args[0];

            if(data.vars.hasOwnProperty(name)) return data.vars[name];
            if(data.inlines.hasOwnProperty(name)) return CompileExpression(data.inlines[name].value["expr"], data);

            switch(name) {
                case "pi":
                    return "pi()";
                case "infinity":
                case "infty":
                case "inf":
                    return "inf()";
            }

            return name;
        case "sum":
            const sumName = "v_" + data.varIdx.value++;

            //Map the user-chosen variable to generated name.
            const sumVar = {[<string>args[0]]: sumName};

            //Make the variable name used here a declared variable, in order to make it work in strict mode.
            data.names.push(sumName);

            return "sum(" + sumName + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], {
                ...data,
                vars: {
                    ...data.vars,
                    ...sumVar
                }
            }, "", {}) + ")";
        case "prod":
            const prodName = "v_" + data.varIdx.value++;

            //Map the user-chosen variable to generated name.
            const prodVar = {[<string>args[0]]: prodName};

            //Make the variable name used here a declared variable, in order to make it work in strict mode.
            data.names.push(prodName);

            return "prod(" + prodName + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], {
                ...data,
                vars: {
                    ...data.vars,
                    ...prodVar
                }
            }, "", {}) + ")";
        case "int":
            const intName = "v_" + data.varIdx.value++;

            //Map the user-chosen variable to generated name.
            const intVar = {[<string>args[0]]: intName};

            //Make the variable name used here a declared variable, in order to make it work in strict mode.
            data.names.push(intName);

            return "int(" + intName + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], {
                ...data,
                vars: {
                    ...data.vars,
                    ...intVar
                }
            }, "", {}) + ")";
        case "div":
            return "div(" + args[0] + "," + CompileBlock(<Statement[]>args[1], {
                ...data,
                vars: {
                    ...data.vars
                }
            }, "", {}) + ")";
        case "b":
            return CompileBlock(<Statement[]>expression.args[0], data, "", {});
        case "a_f":
            //Map the user-chosen variable to the array for Desmos' filter syntax.
            const filterVar = {[<string>args[1]]: <string>args[0]};

            //If it's an array (list of statements), then compile it as a block, otherwise compile the original as an expression (with the .
            const filterFunc =
                Array.isArray(args[2])
                    ? CompileBlock(<Statement[]>args[2], {
                        ...data,
                        vars: {
                            ...data.vars,
                            ...filterVar
                        }
                    }, "", {})
                    : CompileExpression(<Expression>expression.args[2], {
                        ...data,
                        vars: {
                            ...data.vars,
                            ...filterVar
                        }
                    });

            return "array_filter(" + args[0] + "," + filterFunc + ")";
        case "a_m":
            const mapName = "v_" + data.varIdx.value++;

            //Map the user-chosen variable to generated name.
            const mapVar = {[<string>args[1]]: mapName};

            //Make the variable name used for mapping a declared variable, in order to make it work in strict mode.
            data.names.push(mapName);

            //If it's an array (list of statements), then compile it as a block, otherwise compile the original as an expression.
            const mapFunc =
                Array.isArray(args[2])
                ? CompileBlock(<Statement[]>args[2], {
                        ...data,
                        vars: {
                            ...data.vars,
                            ...mapVar
                        }
                    }, "", {})
                : CompileExpression(<Expression>expression.args[2], {
                        ...data,
                        vars: {
                            ...data.vars,
                            ...mapVar
                        }
                    });

            return "array_map(" + args[0] + "," + mapFunc + "," + mapName + ")";
    }

    return "";
}

interface Inline {
    function: boolean;
    value: OuterDeclaration;
}

interface CompileData {
    inlines: Record<string, Inline>;
    templates: Record<string, TemplateFunction>;
    state: TemplateState;
    vars: Record<string, string>;
    stack: string[];
    names: string[];
    varIdx: {value: number};
}