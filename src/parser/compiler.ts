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
import {
    LogimatTemplateState,
    TemplateArg,
    TemplateArgs,
    TemplateContext,
    TemplateFunction,
    TemplateModule,
    TemplateState
} from "../types";
import path from "path";
import {HandleName, isNumeric, opMap} from "./util";
import piecewiseOps from "../libs/piecewiseOps";
import {createTemplates} from "./templates";
import {CompileStackFunction, createExecutionPoint, generateCallFunction, GetStackSelector} from "./stack";

/**
 * Compiles Logimat to a math function (or multiple). Each function/variable will be on a separate line.
 * @param input {string} - is the input Logimat code that will be compiled.
 * @param useTex {boolean} - is a value indicating if the output should be converted to Tex.
 * @param noFS {boolean} - is a valid indicating if untrusted filesystem operations should be blocked (for example, code telling the compiler to load an NPM module). This is not a security feature.
 * @param filePath {string} - is a path to the file currently being compiled.
 * @param piecewise {boolean} - is a value indicating if the output should use piecewise instead of pure math for logic.
 * @param strict {boolean} - is a value indicating if an error should be thrown if an undefined function/variable is used.
 * @param noPolyfill {boolean} - should polyfills be disabled?
 * @param outputMaps {boolean} - is a value indicating if the output should be a map of simplified to unsimplified output.
 * @param simplificationMap {Record<string, string>} - is a map of simplified values to unsimplified values.
 * @param importMap {Record<string, TemplateModule>} - is a map of imports which will be used instead of require if specified.
 * @param unsafe {boolean} - is a value indicating if unsafe features (something where there can be ambiguity in how it is handled, such as with 0^0) are allowed. Enabling this generally makes compiled output smaller/faster.
 * @param unstable {boolean} - is a value indicating if unstable features (something which may not work in all cases but has todate, such as an unproven conjecture) are allowed. Enabling this generally makes compiled output smaller/faster.
 */
export const Compile = async (input: string, useTex: boolean = false, noFS = false, filePath: string = null, piecewise: boolean = false, strict: boolean = false, noPolyfill = false, outputMaps: boolean = false, simplificationMap: Record<string, string> = {}, importMap: Record<string, TemplateModule | string> = {}, unsafe: boolean = false, unstable: boolean = false) : Promise<string | {output: string[], simplificationMap: Record<string, string>, importMap: Record<string, TemplateModule | string>}> => {
    const tree = GetTree(input);

    const state: LogimatTemplateState = {logimat: {files: [], definitions: {
        UNSAFE: unsafe,
        UNSTABLE: unstable,
    }}};
    if(filePath) state.logimat.files = [filePath];

    if(!noFS && filePath) {
        module.paths.push(path.dirname(filePath));
    }

    const templates = createTemplates(noFS, state, importMap);

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

    const declarations = await HandleTreeTemplates(tree.declarations, state, templates, simplificationMap, postTemplates);
    const stdLibDeclarations = await HandleTreeTemplates(GetTree(stdlib).declarations, state, templates, simplificationMap);
    const opsDeclarations = await HandleTreeTemplates(GetTree((piecewise ? piecewiseOps : ops)).declarations, state, templates, simplificationMap);

    // Next, we want to handle export declarations. Exports work by creating an export with a random name, along with the contents
    // of the inline specified by the export. Next, the original inline's contents are changed to point to the new export.
    const fileInlines = GetInlines(declarations, noPolyfill);
    const stdLibInlines = GetInlines(stdLibDeclarations, noPolyfill);
    const opsInlines = GetInlines(opsDeclarations, noPolyfill);

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
                        type: "var",
                        name: "state",
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
        ...fileInlines,
        ...stdLibInlines,
        ...opsInlines,
        ...GetInlines(exportDeclarations, noPolyfill)
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

const HandleTreeTemplates = async (declarations: any[], state: LogimatTemplateState, templates: Record<string, TemplateFunction>, simplificationMap: Record<string, string>, postTemplates?: string[]) : Promise<any[]> => {
    const templatesRef = {
        handledTemplates: true
    };
    let count = 0;

    let newDeclarations: any[];

    try {
        newDeclarations = await TraverseTemplatesArr(declarations, templates, state, templatesRef, simplificationMap);

        //Allow up to 50 layers of functions.
        while(templatesRef.handledTemplates && count < 50) {
            templatesRef.handledTemplates = false;
            newDeclarations = await TraverseTemplatesArr(newDeclarations, templates, state, templatesRef, simplificationMap);

            count++;
        }

        if(postTemplates)
            newDeclarations.push(...GetTree(postTemplates.join("\n")).declarations);

        //Reset variables.
        templatesRef.handledTemplates = true;
        count = 0;

        //Allow up to 50 layers of functions.
        while(templatesRef.handledTemplates && count < 50) {
            templatesRef.handledTemplates = false;
            newDeclarations = await TraverseTemplatesArr(newDeclarations, templates, state, templatesRef, simplificationMap);

            count++;
        }
    } catch(e) {
        //Log the file the error occurred in, if it exists.
        if(state.logimat.files.length > 0) console.error("An error occurred in \"" + state.logimat.files[state.logimat.files.length-1] + "\":");
        throw e;
    }

    return newDeclarations;
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

                    // We should have access to all variables, plus the built-in state.
                    // Because we're making the IDs up, state will be ID 0, and everything
                    // else will be their position in the map + 1.
                    const newVars: Record<number, string> = {0 /* state */: null};
                    const newVariableMap: Record<string, {idx: number, variable: boolean}> = {"state": {idx: 0, variable: true}};

                    let idx = 1;
                    for(const [key, value] of Object.entries(state.logimat.definitions)) {
                        if(typeof(value) !== "number") continue;

                        newVars[idx] = value.toString();
                        // Err on the side of caution: these shouldn't be modifiable.
                        newVariableMap[key] = {idx, variable: false};

                        idx++;
                    }

                    const compiled = CompileExpression(handled as Expression, {
                        inlines: {},
                        varIdx: {value: 0},
                        // Start addrIdx at 1 because 0 represents state.
                        addrIdx: {value: 1},
                        names: definedNames,
                        stack: [],
                        state,
                        templates,
                        vars: newVars,
                        variableMap: newVariableMap,
                        stackStateMap: {},
                        stackFunctionMap: {},
                        stackNextStateMap: {},
                        parentStackPrefix: "",
                        stackIdx: {value: 0},
                        globalStackNumber: {value: 0},
                        localStackNumber: {value: 0},
                        stackContext: false,
                        stackFunctions: [],
                        stackOffset: 0,
                        callFunctionsEmitted: [],
                        strict: false,
                        useTex: false,
                        simplificationMap: {},
                        preCompile: false,
                        shouldExit: {value: false},
                        enableFunctions: {},
                        folderStack: [],
                        loopContext: false,
                    }, []);

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

    let data: CompileData = {
        inlines,
        templates,
        state,
        stack,
        names: [],
        vars: {0 /* state */: null},
        variableMap: {"state": {idx: 0, variable: true}},
        varIdx: {value: varIdx},
        // Start addrIdx at 1 because 0 represents state.
        addrIdx: {value: 1},
        stackStateMap: {},
        stackFunctionMap: {},
        stackNextStateMap: {},
        parentStackPrefix: "",
        stackIdx: {value: 0},
        globalStackNumber: {value: 0},
        localStackNumber: {value: 0},
        stackContext: false,
        stackFunctions: tree.filter(val => val.type === "stackfunction").map(val => val["name"]),
        stackOffset: 0,
        callFunctionsEmitted: [],
        strict,
        useTex,
        simplificationMap,
        preCompile: false,
        shouldExit: {value: false},
        enableFunctions: {"a_rrset": false, "a_dv": false, "r_et": false},
        folderStack: [],
        loopContext: false,
    };

    // Figure out the stack numbers for all stack function entry-points.
    for (const declaration of tree) {
        if (declaration.type !== "stackfunction") continue;

        let stackNum = data.globalStackNumber.value++;
        data.localStackNumber.value++;
        data.stackStateMap[declaration.name + "_0"] = stackNum;
        data.stackFunctionMap[stackNum] = declaration.name + "_0";
        data.stackNextStateMap[declaration.name + "_0"] = declaration.name + "_1";
    }

    // Also, if there are any stack functions, mark
    // the r_unstack function as a valid name.
    if (tree.some(declaration => declaration.type === "stackfunction")) {
        outerNames.push("r_unstack");
    }

    for (const declaration of tree) {
        if (declaration.modifier === "inline") continue;

        const names = Object.assign([], outerNames);
        data = cleanData(data, names);

        try {
            switch(declaration.type) {
                case "display":
                    let val;
                    if(typeof(declaration.value) === "string") val = declaration.value;
                    else if(declaration.value.type === "tstring") val = declaration.value.args.map(arg => {
                        if(typeof(arg) === "string") return arg;
                        else return "${" + SimplifyExpression(CompileExpression(arg, data, out), useTex, strict, names, simplificationMap) + "}";
                    }).join("");
                    else if(declaration.value.type === "aargs") val = HandleName(declaration.value.name) + "\\left(" + declaration.value.args.map(arg => {
                        if(typeof(arg) === "string") {
                            if(arg === "index") return "\\operatorname{index}";
                            return arg;
                        }
                        else return SimplifyExpression(CompileExpression(arg, data, out), useTex, strict, names, simplificationMap);
                    }).join(",") + "\\right)";
                    else val = SimplifyExpression(CompileExpression(declaration.value, data, out), useTex, strict, names, simplificationMap);

                    display[declaration.displayType] = val;
                    break;
                case "function":
                    const functionDeclaration = <OuterFunctionDeclaration>declaration;

                    out.push(...CompileDisplay(display, data));
                    out.push(HandleName(functionDeclaration.name) + "\\left(" + functionDeclaration.args.map(HandleName).join(",") + "\\right)" + "=" + SimplifyExpression(CompileBlock(functionDeclaration.block, data, "", 0 /* state */, true, out), useTex, strict, names.concat(functionDeclaration.args), simplificationMap));
                    break;
                case "stackfunction":
                    // All stack function versions share the same display.
                    // This is useful for folders.
                    const compiledDisplay = CompileDisplay(display, data);;

                    CompileStackFunction(data, declaration, out, useTex, strict, names, simplificationMap, compiledDisplay);

                    break;
                case "const":
                    out.push(...CompileDisplay(display, data));

                    const constDeclaration = <OuterConstDeclaration>declaration;
                    out.push(HandleName(constDeclaration.name) + "=" + SimplifyExpression(CompileExpression(constDeclaration.expr, data, out), useTex, strict, names, simplificationMap));
                    break;
                case "action":
                    out.push(...CompileDisplay(display, data));

                    const actionDeclaration = <ActionDeclaration>declaration;
                    out.push((actionDeclaration.funcName ? HandleName(actionDeclaration.funcName) + (actionDeclaration.args ? "\\left(" + actionDeclaration.args.map(HandleName).join(",") + "\\right)" : "") + "=" : "") + HandleName(actionDeclaration.name) + "\\to " + SimplifyExpression(CompileBlock(actionDeclaration.block, data, "", 0 /* state */, true, out), useTex, strict, actionDeclaration.args ? names.concat(actionDeclaration.args) : names, simplificationMap));
                    break;
                case "actions":
                    out.push(...CompileDisplay(display, data));

                    const actionsDeclaration = <ActionsDeclaration>declaration;

                    //Get the name without the args (the first part before the opening parenthesis)
                    const badActions = actionsDeclaration.args.filter(action => !names.includes(action[0]));
                    if(strict && badActions.length > 0) {
                        throw new Error("The following actions have not been defined: " + badActions.map(action => "\"" + action[0] + "\"").join(", ") + ".");
                    }

                    out.push(HandleName(actionsDeclaration.name) + (actionsDeclaration.actionArgs ? "\\left(" + actionsDeclaration.actionArgs.map(HandleName).join(",") + "\\right)" : "") + "=" + actionsDeclaration.args.map(action => HandleName(action[0]) + (action.length > 1 ? "\\left(" + action.slice(1).map(HandleName) + "\\right)" : "")).join(","));
                    break;
                case "expression":
                    out.push(...CompileDisplay(display, data));

                    const expressionDeclaration = <ExpressionDeclaration>declaration;
                    out.push(SimplifyExpression(CompileBlock(expressionDeclaration.block, data, "", 0 /* state */, true, out), useTex, strict, names, simplificationMap));
                    break;
                case "graph":
                    out.push(...CompileDisplay(display, data));

                    //Give the graph access to x and y.
                    names.push("x", "y");

                    const graphDeclaration = <GraphDeclaration>declaration;
                    out.push(SimplifyExpression(CompileExpression(graphDeclaration.p1, data, out), useTex, strict, names, simplificationMap) + opMap[graphDeclaration.op] + SimplifyExpression(CompileExpression(graphDeclaration.p2, data, out), useTex, strict, names, simplificationMap));
                    break;
                case "point":
                    out.push(...CompileDisplay(display, data));

                    const pointDeclaration = <PointDeclaration>declaration;
                    out.push(SimplifyExpression(CompileExpression(pointDeclaration.point, data, out), useTex, strict, names, simplificationMap));
                    break;
                case "polygon":
                    out.push(...CompileDisplay(display, data));

                    const polygonDeclaration = <PolygonDeclaration>declaration;
                    out.push("\\operatorname{polygon}" + "\\left(" + polygonDeclaration.points.map(point => SimplifyExpression(CompileExpression(point, data, out), useTex, strict, names, simplificationMap)).join(",") + "\\right)");
                    break;
                case "folder":
                    // Null means pop.
                    if(declaration.text === null) data.folderStack.pop();
                    else data.folderStack.push(declaration.text);

                    break;
            }
        } catch(e) {
            console.error("An error occurred while compiling type \"" + declaration.type + "\", modifier \"" + declaration.modifier + "\"" + (declaration["name"] ? ", name \"" + declaration["name"] + "\"" : "") + ":");
            throw e;
        }
    }

    // If we used any functions that need to be enabled, output them.
    const functions = [
        ["a_dv", "stack_adv", ["s_tack", "n_um"]],
        ["r_et", "stack_ret", ["s_tack"]],
        ["a_rrset", "array_set", ["a_rr", "i_dx", "n_ewvalue"]],
    ].filter(([functionName]) => data.enableFunctions[functionName as string]) as [string, string, string[]][];

    for(const [newFn, oldFn, args] of functions) {
        const names = Object.assign([], outerNames);
        data = cleanData(data, names);

        const code: Statement[] = [
            {
                type: "var",
                name: "state",
                expr: {
                    type: "f",
                    args: [
                        oldFn,
                        args,
                    ]
                }
            }
        ];

        out.push(HandleName(newFn) + "\\left(" + args.map(HandleName).join(",") + "\\right)" + "=" + SimplifyExpression(CompileBlock(code, data, "", 0 /* state */, true, out), useTex, strict, names.concat(args), simplificationMap));
    }

    // If there were stack functions used, create the method to run them.
    if(data.stackFunctions.length !== 0) {
        const names = Object.assign([], outerNames);
        data = cleanData(data, names);

        out.push(GetStackSelector(data));
    }

    return {output: out, simplificationMap};
}

const CompileDisplay = (input: Record<string, string>, data: CompileData) => {
    // If we're in a folder, and there's not a display overriding it, output it.
    if("display" in input) {
        // If there's no name set, then we shouldn't output it.
        // We won't change it to the current folder though,
        // since it may have been intentionally overridden.
        if(input["display"] === "") delete input["display"];
    } else if(data.folderStack.length !== 0) {
        input["folder"] = data.folderStack[data.folderStack.length - 1];
    }

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

export const GetStatementsTree = (input: string) : Statement[] => {
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

const GetInlines = (tree: OuterDeclaration[], noPolyfill: boolean) : Record<string, Inline> => {
    const inlines: Record<string, Inline> = {};

    for (const declaration of tree) {
        if(declaration.modifier !== "inline") continue;

        if(declaration.type === "function" && declaration.polyfill && noPolyfill) {
            continue;
        }

        inlines[declaration["name"]] = {function: declaration.type === "function", value: declaration};
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

export const CompileBlock = (input: Statement[], data: CompileData, defaultOut: string, curVar: number, requireOutput: boolean, compilerOutput: string[]) : string => {
    let out = defaultOut;
    let newVars = {
        // State (0) should always exist.
        0: null,
        ...data.vars
    };
    let variableMap = {...data.variableMap};

    // State should always exist.
    if(!("state" in variableMap)) variableMap["state"] = {idx: 0, variable: true};

    // If we're in a stack function, we need to re-map if
    // statements to make them easier to handle.
    // We'll change:
    // if (condition) {
    //     ... code
    // } else {
    //     ... code
    // }
    //
    // Into:
    // if (condition) {
    //     ... code
    // }
    //
    // if(!condition) {
    //     ... code
    // }

    if(data.stackContext) {
        input = input.flatMap(statement => {
            if(statement.type !== "if") return [statement];

            if(statement.elseaction == null) return [statement];

            const elseaction = statement.elseaction;

            return [statement, {type: "if", condition: {type: "f", args: ["not", [statement.condition]]}, ifaction: elseaction, onlyOnStack: true}] as Statement[];
        });
    }

    for (const statement of input) {
        switch(statement.type) {
            case "const":
                const newConstIdx = data.addrIdx.value++;

                newVars[newConstIdx] = CompileExpression(statement["expr"], {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, compilerOutput);

                variableMap[statement["name"]] = {idx: newConstIdx, variable: false};

                break;
            case "let":
                const newVarIdx = data.addrIdx.value++;

                newVars[newVarIdx] = CompileExpression(statement["expr"], {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, compilerOutput);

                variableMap[statement["name"]] = {idx: newVarIdx, variable: true};

                break;
            case "var":
                // Check only actual variables because we can't set constants.
                if(!(statement["name"] in variableMap)) {
                    throw new Error("Cannot set undeclared variable \"" + statement["name"] + "\".");
                }
                if(!variableMap[statement["name"]].variable) {
                    throw new Error("Cannot set constant \"" + statement["name"] + "\".");
                }

                const variable = variableMap[statement["name"]];

                // If it's a stack variable, then we want to actually do the following:
                // stack = a_rrset(stack, &variable, value);
                if(variable.stack) {
                    const stackVariable = variableMap["stack"];
                    newVars[stackVariable.idx] = CompileExpression({
                        type: "f",
                        args: [
                            "a_rrset",
                            [
                                {type: "v", args: ["stack"]},
                                {type: "v", args: ["&" + statement["name"]]},
                                statement["expr"]
                            ]
                        ]
                    }, {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);
                    if(curVar === stackVariable.idx) out = newVars[stackVariable.idx];

                    break;
                }

                newVars[variable.idx] = CompileExpression(statement["expr"], {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, compilerOutput);
                if(curVar === variable.idx) out = newVars[variable.idx];
                break;
            case "stackvar":
                if(!data.stackContext) {
                    throw new Error("Stackvars can only be ran from inside of a stack function!");
                }

                // Each stackvar has a main variable (of the name that it's given),
                // which retrieves the value itself, and a reference variable, prefixed
                // by an &, which will instead return the pointer.
                // Setting the main variable will desugar to stack[&variable] = data;

                const stackOffset = data.stackOffset++;

                // Create the main variable.
                // Setting stack to true enables the special handling mentioned above.
                {
                    const newStackvarIdx = data.addrIdx.value++;

                    // This is the default value, although
                    // special handling is given in CompileExpression.
                    newVars[newStackvarIdx] = CompileExpression(GetExpression("stack[s_tack[2] + " + stackOffset + "]"), {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);

                    variableMap[statement.name] = {idx: newStackvarIdx, variable: true, stack: true};
                }

                // Create the reference variable.
                {
                    const newStackvarIdx = data.addrIdx.value++;

                    newVars[newStackvarIdx] = CompileExpression(GetExpression("s_tack[2] + " + stackOffset), {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);

                    variableMap["&" + statement.name] = {idx: newStackvarIdx, variable: false};
                }

                break;
            case "if":
                if(!statement["elseaction"] && !out) {
                    throw new Error("The state must be set before an else-less if can be used.");
                }

                const condition = CompileExpression(statement["condition"], {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, compilerOutput);

                // These blocks must be compiled for every variable.
                // If they're different from the original variable, then we'll
                // update the variable with the condition.
                // Also, we need to wait to update the variables until the end, or else
                // parts of the compilation will use values which shouldn't exist yet.
                const updateMap = [];

                // Because this runs in a loop, we need to ensure
                // that stack execution points are created the same
                // way each time.
                // This means that we need to reset their counters.
                // stackNum won't be reset because it's only modified
                // if there's a new name.
                // Setting things up this way ensures that there never is.
                const oldStackIdx = data.stackIdx.value;

                for(const variableName in variableMap) {
                    // Special handling down below.
                    if(data.stackContext && variableName === "stack") continue;
                    if(data.stackContext && statement.onlyOnStack) break;

                    const variable = variableMap[variableName];

                    // There's no reason to compile for constants.
                    if(!variable.variable) continue;

                    const ifaction = CompileBlock(statement["ifaction"], {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, newVars[variable.idx], variable.idx, false, compilerOutput);
                    const elseaction = statement["elseaction"] ? CompileBlock(statement["elseaction"], {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, newVars[variable.idx], variable.idx, false, compilerOutput) : newVars[variable.idx];

                    // If they're the same, that just means the variable wasn't set.
                    if(ifaction !== newVars[variable.idx] || elseaction !== newVars[variable.idx]) {
                        updateMap.push([variable.idx, CompileExpression({
                            type: "f",
                            args: ["if_func", [condition, ifaction, elseaction]]
                        }, {
                            ...data,
                            vars: {
                                ...newVars,
                            },
                            variableMap: {
                                ...variableMap
                            }
                        }, compilerOutput)]);
                    }

                    // The special handling below will save the
                    // value of this.
                    data.stackIdx.value = oldStackIdx;
                    // If a stack function ran here, it may have instructed us to
                    // exit early.
                    // Like stackIDx, this will be handled below.
                    data.shouldExit.value = false;
                }

                // Special handling for stack.
                if(data.stackContext) {
                    // As per above, we'll transform if statements modifying stack
                    // to have no elses.
                    // That means that if there is an else here, we won't handle it,
                    // because it has been transformed to an if.

                    const ifaction = CompileBlock(statement["ifaction"], {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, newVars[variableMap["stack"].idx], variableMap["stack"].idx, false, compilerOutput);

                    const elseaction = newVars[variableMap["stack"].idx];

                    let expression: Expression;
                    let compiled: string;
                    let shouldUse: boolean;

                    // This means that te stack has been reset,
                    // so we should carry the reset upwards.
                    if(!ifaction) {
                        expression = {type: "v", args: ["s_tack1"]};
                        shouldUse = true;
                    } else {
                        expression = {
                            type: "f",
                            args: ["if_func", [condition, ifaction, elseaction]]
                        };
                        shouldUse = newVars[variableMap["stack"].idx] !== ifaction;
                    }

                    if(expression) {
                        compiled = CompileExpression(expression, {
                            ...data,
                            vars: {
                                ...newVars,
                            },
                            variableMap: {
                                ...variableMap
                            }
                        }, compilerOutput);
                    }

                    if(shouldUse) {
                        updateMap.push([variableMap["stack"].idx, compiled]);
                    }
                }

                for(const [variableIdx, expr] of updateMap) {
                    newVars[variableIdx] = expr;
                    if(curVar === variableIdx) out = expr;
                }

                break;
            case "function":
                if(!data.stackContext) {
                    throw new Error("Functions can only be ran from inside of a stack function!");
                }
                if(!data.stackFunctions.includes(statement.name)) {
                    throw new Error("Only stack functions can be ran!");
                }

                // Don't handle stack-functions in non-stack environments.
                if(curVar !== variableMap["stack"].idx) {
                    break;
                }

                let {nextStepNum, stackNum} = createExecutionPoint(data);

                // Use the call function if it already exists,
                // otherwise generate if.
                generateCallFunction(data, statement.args.length, compilerOutput);

                // There's no reason for us to compile anything if this isn't requested.
                // The code above is required to run, however.
                if(Number(newVars[variableMap["stacknum"].idx]) !== stackNum) {
                    // In this case, reset the state back to its original version
                    // as all updates to it have already been made by the last
                    // execution point.
                    newVars[variableMap["stack"].idx] = CompileExpression({
                        type: "v",
                        // This is the unmodified stack.
                        args: ["s_tack1"],
                    }, {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);
                    if(curVar === variableMap["stack"].idx) out = "";

                    break;
                }

                // The stack num has already been generated here, so we can retrieve it.
                const callStackNum = data.stackStateMap[statement.name + "_0"];

                let runCode = `stack = c_all${statement.args.length}(stack,${callStackNum},${nextStepNum},${data.stackOffset}`;
                if(statement.args.length !== 0) runCode += ",";
                for(let i = 0; i < statement.args.length; i++) {
                    runCode += `${CompileExpression(statement.args[i], {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput)}`
                    if(i !== statement.args.length - 1) {
                        runCode += ",";
                    }
                }
                runCode += ");";

                newVars[variableMap["stack"].idx] = CompileBlock(GetStatementsTree(runCode), {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, newVars[variableMap["stack"].idx], variableMap["stack"].idx, true, compilerOutput);
                if(curVar === variableMap["stack"].idx) out = newVars[variableMap["stack"].idx];

                // We're stopping for now.
                // Another subfunction can handle the rest.
                // This isn't useful on pre-compiles though, as
                // we want to hit all execution points.
                if(!data.preCompile) {
                    data.shouldExit.value = true;
                }

                break;
            case "return": {
                if(!data.stackContext) {
                    throw new Error("Returns can only be happen inside of a stack function!");
                }

                // Don't handle stack-functions in non-stack environments.
                if(curVar !== variableMap["stack"].idx) {
                    break;
                }

                let {stackNum} = createExecutionPoint(data);

                // There's no reason for us to compile anything if this isn't requested.
                // The code above is required to run, however.
                if(Number(newVars[variableMap["stacknum"].idx]) !== stackNum) {
                    // In this case, reset the state back to its original version
                    // as all updates to it have already been made by the last
                    // execution point.
                    newVars[variableMap["stack"].idx] = CompileExpression({
                        type: "v",
                        // This is the unmodified stack.
                        args: ["s_tack1"],
                    }, {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);
                    if(curVar === variableMap["stack"].idx) out = "";

                    break;
                }

                newVars[variableMap["stack"].idx] = CompileBlock([{
                    type: "var",
                    name: "stack",
                    expr: {
                        type: "f",
                        args: [
                            "r_et",
                            [
                                {type: "v", args: ["stack"]}
                            ]
                        ]
                    }
                }], {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, newVars[variableMap["stack"].idx], variableMap["stack"].idx, true, compilerOutput);
                if(curVar === variableMap["stack"].idx) out = newVars[variableMap["stack"].idx];

                // We're stopping for now.
                // Another subfunction can handle the rest.
                // This isn't useful on pre-compiles though, as
                // we want to hit all execution points.
                if(!data.preCompile) {
                    data.shouldExit.value = true;
                }

                break;
            }
            case "loop": {
                if(!data.stackContext) {
                    throw new Error("Loops can only be used inside of a stack function!");
                }

                // Don't handle stack-functions in non-stack environments.
                if(curVar !== variableMap["stack"].idx) {
                    break;
                }

                // Create an execution point for all the code before the while loop.
                // If the state is set before the while loop, then without this, it
                // will be as though it's done inside it.
                let {stackNum: prevStackNum} = createExecutionPoint(data);

                // If we're in actual compilation mode and we're currently doing the previous
                // execution point, then this while shouldn't be compiled at all.
                if(!data.preCompile && Number(newVars[variableMap["stacknum"].idx]) === prevStackNum) {
                    data.shouldExit.value = true;
                    break;
                }

                let {stackNum, stackName} = createExecutionPoint(data);

                // Because we've created an execution point for prior code
                // to live in, we shouldn't use the current state.
                // Instead, we should revert back to the original stack.
                const resetCode: Statement = {
                    type: "var",
                    name: "stack",
                    expr: {
                        type: "v",
                        args: ["s_tack1"]
                    },
                };

                const runCode: Statement[] = [];

                // - execution point-
                // ... code
                // - loop back (continue_last) -
                if(Number(newVars[variableMap["stacknum"].idx]) === stackNum || data.preCompile) {
                    runCode.push(
                        resetCode,
                        {
                            type: "var",
                            name: "stack",
                            expr: {
                                type: "f",
                                args: [
                                    "a_dv",
                                    [
                                        {type: "v", args: ["stack"]},
                                        data.stackStateMap[stackName + "_0"],
                                    ],
                                ]
                            }
                        }
                    );

                    // If we're pre-compiling, we'll include the other code here.
                    // Otherwise, this is all we need to compile.
                    if(data.preCompile) {
                        runCode.push(...statement.body, {type: "continue_last"});
                    }
                } else if(getNumToName(data)[Number(newVars[variableMap["stacknum"].idx])].startsWith(stackName)) {
                    runCode.push(resetCode, ...statement.body, {type: "continue_last"});
                } else {
                    // It isn't our turn to run, but we still need to compile the
                    // code inside the loop to ensure that our state remains consistent.
                    // This is the minimum needed to do that: the body may contain
                    // execution points, and the continue_last is an execution point.
                    const oldParent = data.parentStackPrefix;
                    const oldIdx = data.stackIdx.value;
                    data.parentStackPrefix = stackName;
                    data.stackIdx.value = 0;
                    data.loopContext = true;

                    CompileBlock([...statement.body, {type: "continue_last"}], {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, newVars[variableMap["stack"].idx], variableMap["stack"].idx, false, compilerOutput);

                    data.parentStackPrefix = oldParent;
                    data.stackIdx.value = oldIdx;
                    data.loopContext = false;

                    // In this case, reset the state back to its original version
                    // as all updates to it have already been made by the last
                    // execution point.
                    newVars[variableMap["stack"].idx] = CompileExpression({
                        type: "v",
                        // This is the unmodified stack.
                        args: ["s_tack1"],
                    }, {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);
                    if(curVar === variableMap["stack"].idx) out = "";

                    break;
                }

                const oldParent = data.parentStackPrefix;
                const oldIdx = data.stackIdx.value;
                data.parentStackPrefix = stackName;
                data.stackIdx.value = 0;
                data.loopContext = true;

                newVars[variableMap["stack"].idx] = CompileBlock(runCode, {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, newVars[variableMap["stack"].idx], variableMap["stack"].idx, true, compilerOutput);
                if(curVar === variableMap["stack"].idx) out = newVars[variableMap["stack"].idx];

                data.parentStackPrefix = oldParent;
                data.stackIdx.value = oldIdx;
                data.loopContext = false;

                // We're stopping for now.
                // Another subfunction can handle the rest.
                // This isn't useful on pre-compiles though, as
                // we want to hit all execution points.
                if(!data.preCompile) {
                    data.shouldExit.value = true;
                }

                break;
            }
            case "break": {
                if(!data.stackContext) {
                    throw new Error("Breaks can only be happen inside of a stack function!");
                }

                if(!data.loopContext) {
                    throw new Error("Breaks can only be happen inside of a loop!");
                }

                // Don't handle stack-functions in non-stack environments.
                if(curVar !== variableMap["stack"].idx) {
                    break;
                }

                // The only things that create new parent states
                // are loops, so all we have to do here is
                // find the state after the parent state, and
                // advance to it.
                const lastPartIndex = data.parentStackPrefix.lastIndexOf("_");
                const parentLastIdx = Number(data.parentStackPrefix.slice(lastPartIndex + 1));

                const afterParentName = data.parentStackPrefix.slice(0, lastPartIndex + 1) + (parentLastIdx + 1);
                const afterParentStackNum = data.stackStateMap[afterParentName];

                let {stackNum} = createExecutionPoint(data);

                // There's no reason for us to compile anything if this isn't requested.
                // The code above is required to run, however.
                if(Number(newVars[variableMap["stacknum"].idx]) !== stackNum) {
                    // In this case, reset the state back to its original version
                    // as all updates to it have already been made by the last
                    // execution point.
                    newVars[variableMap["stack"].idx] = CompileExpression({
                        type: "v",
                        // This is the unmodified stack.
                        args: ["s_tack1"],
                    }, {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);
                    if(curVar === variableMap["stack"].idx) out = "";

                    break;
                }

                newVars[variableMap["stack"].idx] = CompileBlock([{
                    type: "var",
                    name: "stack",
                    expr: {
                        type: "f",
                        args: [
                            "a_dv",
                            [
                                {type: "v", args: ["stack"]},
                                afterParentStackNum.toString()
                            ],
                        ]
                    }
                }], {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, newVars[variableMap["stack"].idx], variableMap["stack"].idx, true, compilerOutput);
                if(curVar === variableMap["stack"].idx) out = newVars[variableMap["stack"].idx];

                // We're stopping for now.
                // Another subfunction can handle the rest.
                // This isn't useful on pre-compiles though, as
                // we want to hit all execution points.
                if(!data.preCompile) {
                    data.shouldExit.value = true;
                }

                break;
            }
            case "continue":
            {
                if(!data.stackContext) {
                    throw new Error("Continues can only be happen inside of a stack function!");
                }

                if(!data.loopContext) {
                    throw new Error("Continues can only be happen inside of a loop!");
                }

                // Don't handle stack-functions in non-stack environments.
                if(curVar !== variableMap["stack"].idx) {
                    break;
                }

                let {stackNum} = createExecutionPoint(data);

                // There's no reason for us to compile anything if this isn't requested.
                // The code above is required to run, however.
                if(Number(newVars[variableMap["stacknum"].idx]) !== stackNum) {
                    // In this case, reset the state back to its original version
                    // as all updates to it have already been made by the last
                    // execution point.
                    newVars[variableMap["stack"].idx] = CompileExpression({
                        type: "v",
                        // This is the unmodified stack.
                        args: ["s_tack1"],
                    }, {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);
                    if(curVar === variableMap["stack"].idx) out = "";

                    break;
                }

                const parentStackNum = data.stackStateMap[data.parentStackPrefix];

                newVars[variableMap["stack"].idx] = CompileBlock([{
                    type: "var",
                    name: "stack",
                    expr: {
                        type: "f",
                        args: [
                            "a_dv",
                            [
                                {type: "v", args: ["stack"]},
                                parentStackNum.toString()
                            ],
                        ]
                    }
                }], {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, newVars[0], variableMap["stack"].idx, true, compilerOutput);
                if(curVar === variableMap["stack"].idx) out = newVars[variableMap["stack"].idx];

                // We're stopping for now.
                // Another subfunction can handle the rest.
                // This isn't useful on pre-compiles though, as
                // we want to hit all execution points.
                if(!data.preCompile) {
                    data.shouldExit.value = true;
                }

                break;
            }
            case "continue_last":
            {
                // Don't handle stack-functions in non-stack environments.
                if(curVar !== variableMap["stack"].idx) {
                    break;
                }

                let {stackNum, stackName} = createExecutionPoint(data, null, true);
                // This is intended to run at the end of a loop,
                // and can only be invoked by the compiler.
                // Therefore, we know that this will, in all cases, go to the parent.
                data.stackNextStateMap[stackName] = data.parentStackPrefix;

                // There's no reason for us to compile anything if this isn't requested.
                // The code above is required to run, however.
                if(Number(newVars[variableMap["stacknum"].idx]) !== stackNum) {
                    // In this case, reset the state back to its original version
                    // as all updates to it have already been made by the last
                    // execution point.
                    newVars[variableMap["stack"].idx] = CompileExpression({
                        type: "v",
                        // This is the unmodified stack.
                        args: ["s_tack1"],
                    }, {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);
                    if(curVar === variableMap["stack"].idx) out = "";

                    break;
                }

                const parentStackNum = data.stackStateMap[data.parentStackPrefix];

                newVars[variableMap["stack"].idx] = CompileBlock([{
                    type: "var",
                    name: "stack",
                    expr: {
                        type: "f",
                        args: [
                            "a_dv",
                            [
                                {type: "v", args: ["stack"]},
                                parentStackNum.toString()
                            ],
                        ]
                    }
                }], {
                    ...data,
                    vars: {
                        ...newVars,
                    },
                    variableMap: {
                        ...variableMap
                    }
                }, newVars[0], variableMap["stack"].idx, true, compilerOutput);
                if(curVar === variableMap["stack"].idx) out = newVars[variableMap["stack"].idx];

                // We're stopping for now.
                // Another subfunction can handle the rest.
                // This isn't useful on pre-compiles though, as
                // we want to hit all execution points.
                if(!data.preCompile) {
                    data.shouldExit.value = true;
                }

                break;
            }
            case "debug":
            {
                // Debugs should only run once, so they shouldn't happen in pre-compiles.
                if(data.preCompile) {
                    break;
                }

                // If we're in a stack function, then this should only run when
                // it makes sense to do so, which is in the state that owns this debug.
                // That state is localStackNum.value.
                if(data.stackContext && Number(newVars[variableMap["stacknum"].idx]) !== data.localStackNumber.value) {
                    break;
                }

                const compiledValues = statement.values.map(value => {
                    if(typeof(value) === "string") {
                        return value;
                    }

                    return CompileExpression(value, {
                        ...data,
                        vars: {
                            ...newVars,
                        },
                        variableMap: {
                            ...variableMap
                        }
                    }, compilerOutput);
                });

                console.log(/* DO NOT remove this console.log */ ...compiledValues);

                break;
            }
        }

        if(data.shouldExit.value) {
            break;
        }
    }

    // Stack is global, so doesn't require being output.
    if(requireOutput && (out === "" || out == null) && !(data.stackContext && curVar === variableMap["stack"].idx)) {
        throw new Error("The state must be set inside of this block.");
    }
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

const CompileExpression = (expression: Expression, data: CompileData, compilerOutput: string[]) : string => {
    if(expression == null) return null;
    if(typeof(expression) !== "object") return expression;

    const args = expression.args.map(arg => arg != null && typeof(arg) === "object" && arg.hasOwnProperty("type") && arg.hasOwnProperty("args") ? CompileExpression(<Expression>arg, data, compilerOutput) : arg);

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
            const fargs = (<any[]>expression.args[1]).map(arg => arg != null && typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, data, compilerOutput) : arg);

            // If this is a function that can be enabled, then enable it
            // because we're using it.
            if(data.enableFunctions.hasOwnProperty(<string>expression.args[0])) {
                data.enableFunctions[<string>expression.args[0]] = true;
                if(!data.names.includes(<string>expression.args[0])) data.names.push(<string>expression.args[0]);
            }

            if(!data.inlines.hasOwnProperty(<string>expression.args[0])) {
                if(piecewiseFunctions.includes(<string>expression.args[0])) return HandlePiecewise(<string>expression.args[0], fargs);
                return <string>expression.args[0] + "(" + fargs.join(",") + ")";
            }

            const fargnames = (<OuterFunctionDeclaration>data.inlines[<string>expression.args[0]].value).args;

            if(fargnames.length !== fargs.length) throw new Error("Inline function \"" + expression.args[0] + "\" requires " + fargnames.length + ", but only " + fargs.length + " are given.");

            data.stack.push(<string>expression.args[0]);

            const newData = {...data, vars: {...data.vars}, variableMap: {...data.variableMap}};
            for(let i = 0; i < fargs.length; i++) {
                const name = fargnames[i];
                const data = fargs[i];

                const argIdx = newData.addrIdx.value++;
                newData.vars[argIdx] = data;
                newData.variableMap[name] = {idx: argIdx, variable: false};
            }

            const result = CompileBlock((<OuterFunctionDeclaration>data.inlines[<string>expression.args[0]].value).block, newData, "", 0 /* state */, true, compilerOutput);
            data.stack.pop();

            return "(" + result + ")";
        case "v":
            const name = <string>expression.args[0];

            if(name in data.variableMap) {
                const variable = data.variableMap[name];
                if(variable.stack) {
                    // This is a "virtual" variable.
                    // It's sugar for:
                    // stack[&variable].
                    return CompileExpression({type: "f", args: ["array_idx", [{type: "v", args: ["stack"]}, {type: "v", args: ["&" + name]}]]}, data, compilerOutput);
                }

                return data.vars[variable.idx];
            }
            if(data.inlines.hasOwnProperty(name)) return CompileExpression(data.inlines[name].value["expr"], data, compilerOutput);

            switch(name) {
                case "pi":
                    return "pi()";
                case "tau":
                    return "tau()";
                case "infinity":
                case "infty":
                case "inf":
                    return "inf()";
                case "width":
                    return "width()";
                case "height":
                    return "height()";
            }

            return name;
        case "sid":
            const stackName = <string>expression.args[0];

            if(!((stackName + "_0") in data.stackStateMap)) {
                throw new Error("The stack function \"" + stackName + "\" does not exist!");
            }

            return data.stackStateMap[stackName + "_0"].toString();
        case "sum":
            const sumName = "v_" + data.varIdx.value++;

            //Map the user-chosen variable to generated name.
            const sumVarIdx = data.addrIdx.value++;
            const sumVar = {[sumVarIdx]: sumName};
            const sumVarData = {[<string>args[0]]: {idx: sumVarIdx, variable: false}};

            //Make the variable name used here a declared variable, in order to make it work in strict mode.
            data.names.push(sumName);

            return "sum(" + sumName + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], {
                ...data,
                vars: {
                    ...data.vars,
                    ...sumVar
                },
                variableMap: {
                    ...data.variableMap,
                    ...sumVarData
                }
            }, "", 0 /* state */, true, compilerOutput) + ")";
        case "prod":
            const prodName = "v_" + data.varIdx.value++;

            //Map the user-chosen variable to generated name.
            const prodVarIdx = data.addrIdx.value++;
            const prodVar = {[prodVarIdx]: prodName};
            const prodVarData = {[<string>args[0]]: {idx: prodVarIdx, variable: false}};

            //Make the variable name used here a declared variable, in order to make it work in strict mode.
            data.names.push(prodName);

            return "prod(" + prodName + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], {
                ...data,
                vars: {
                    ...data.vars,
                    ...prodVar
                },
                variableMap: {
                    ...data.variableMap,
                    ...prodVarData
                }
            }, "", 0 /* state */, true, compilerOutput) + ")";
        case "int":
            const intName = "v_" + data.varIdx.value++;

            //Map the user-chosen variable to generated name.
            const intVarIdx = data.addrIdx.value++;
            const intVar = {[intVarIdx]: intName};
            const intVarData = {[<string>args[0]]: {idx: intVarIdx, variable: false}};

            //Make the variable name used here a declared variable, in order to make it work in strict mode.
            data.names.push(intName);

            return "int(" + intName + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], {
                ...data,
                vars: {
                    ...data.vars,
                    ...intVar
                },
                variableMap: {
                    ...data.variableMap,
                    ...intVarData
                }
            }, "", 0 /* state */, true, compilerOutput) + ")";
        case "div":
            return "div(" + args[0] + "," + CompileBlock(<Statement[]>args[1], {
                ...data,
                vars: {
                    ...data.vars
                },
                variableMap: {
                    ...data.variableMap
                }
            }, "", 0 /* state */, true, compilerOutput) + ")";
        case "b":
            return CompileBlock(<Statement[]>expression.args[0], data, "", 0 /* state */, true, compilerOutput);
        case "a_f":
            //Map the user-chosen variable to the array for Desmos' filter syntax.
            const filterVarIdx = data.addrIdx.value++;
            const filterVar = {[filterVarIdx]: <string>args[0]};
            const filterVarData = {[<string>args[1]]: {idx: filterVarIdx, variable: false}};

            //If it's an array (list of statements), then compile it as a block, otherwise compile the original as an expression (with the .
            const filterFunc =
                Array.isArray(args[2])
                    ? CompileBlock(<Statement[]>args[2], {
                        ...data,
                        vars: {
                            ...data.vars,
                            ...filterVar
                        },
                        variableMap: {
                            ...data.variableMap,
                            ...filterVarData,
                        }
                    }, "", 0 /* state */, true, compilerOutput)
                    : CompileExpression(<Expression>expression.args[2], {
                        ...data,
                        vars: {
                            ...data.vars,
                            ...filterVar
                        },
                        variableMap: {
                            ...data.variableMap,
                            ...filterVarData,
                        }
                    }, compilerOutput);

            return "array_filter(" + args[0] + "," + filterFunc + ")";
        case "a_m":
            const mapName = "v_" + data.varIdx.value++;

            //Map the user-chosen variable to generated name.
            const mapVarIdx = data.addrIdx.value++;
            const mapVar = {[mapVarIdx]: mapName};
            const mapVarData = {[<string>args[1]]: {idx: mapVarIdx, variable: false}};

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
                        },
                        variableMap: {
                            ...data.variableMap,
                            ...mapVarData,
                        }
                    }, "", 0 /* state */, true, compilerOutput)
                : CompileExpression(<Expression>expression.args[2], {
                        ...data,
                        vars: {
                            ...data.vars,
                            ...mapVar
                        },
                        variableMap: {
                            ...data.variableMap,
                            ...mapVarData,
                        }
                    }, compilerOutput);

            return "array_map(" + args[0] + "," + mapFunc + "," + mapName + ")";
    }

    return "";
}

/**
 * Resets fields of a `CompileData` so that it can be used
 * on a different declaration.
 */
export const cleanData = (data: CompileData, names: string[]) : CompileData => {
    return {
        inlines: data.inlines,
        templates: data.templates,
        state: data.state,
        stack: data.stack,
        names,
        vars: {0 /* state */: null},
        variableMap: {"state": {idx: 0, variable: true}},
        varIdx: data.varIdx,
        addrIdx: data.addrIdx,
        stackStateMap: data.stackStateMap,
        stackFunctionMap: data.stackFunctionMap,
        stackNextStateMap: data.stackNextStateMap,
        parentStackPrefix: "",
        stackIdx: {value: 0},
        globalStackNumber: data.globalStackNumber,
        localStackNumber: data.localStackNumber,
        stackContext: false,
        stackFunctions: data.stackFunctions,
        stackOffset: 0,
        callFunctionsEmitted: data.callFunctionsEmitted,
        useTex: data.useTex,
        strict: data.strict,
        simplificationMap: data.simplificationMap,
        preCompile: data.preCompile,
        shouldExit: {value: false},
        enableFunctions: data.enableFunctions,
        folderStack: data.folderStack,
        loopContext: data.loopContext,
    };
}

export const getNumToName = (data: CompileData) : Record<number, string> => {
    return Object.fromEntries(Object.entries(data.stackStateMap).map(([a, b]) => [b, a]));
}

interface Inline {
    function: boolean;
    value: OuterDeclaration;
}

export interface CompileData {
    inlines: Record<string, Inline>;
    templates: Record<string, TemplateFunction>;
    state: TemplateState;
    vars: Record<number, string>;
    variableMap: Record<string, {idx: number, variable: boolean, stack?: boolean}>;
    stack: string[];
    names: string[];
    /**
     * Holds the next index for generated variables (such as those produced in an array map).
     */
    varIdx: {value: number};
    /**
     * Holds the next index/address for a variable. This is the key for vars, and the idx field in
     * variableMap.
     */
    addrIdx: {value: number};
    /**
     * Maps from stack names to numbers.
     * Each name represents a different execution step of a stack function.
     * They are generated like \`${PARENT_NAME}_${STACK_IDX}\`.
     * In case of while loops or other nesting, names may look like
     * function_1_2_3.
     * All that's important is that the names are consistent, and that a child
     * can refer back to its parent.
     * The first idx is always 0, and the last one is always accounted for
     * by the parent.
     * If the parent is a function, then the last step will be returning.
     * If it is a loop, then it will simply refer back to itself.
     */
    stackStateMap: Record<string, number>;
    /**
     * Maps stack numbers to function names.
     */
    stackFunctionMap: Record<number, string>;
    /**
     * Maps a state to its next one.
     */
    stackNextStateMap: Record<string, string>;
    parentStackPrefix: string;
    /**
     * This is reset each time the parent changes, and
     * incremented each time a new execution step is added.
     */
    stackIdx: {value: number};
    globalStackNumber: {value: number};
    /** Identical to globalStackNumber, except it gets reset after each compile of the same function (even pre-compiles). */
    localStackNumber: {value: number};
    stackContext: boolean;
    stackFunctions: string[];
    /**
     * The offset needed to get to the end of the stack.
     * Stack frame pointer + stack offset is the number
     * immediately following the end of the stack.
     * In other words, this is the position where a items
     * can be pushed onto the stack.
     */
    stackOffset: number;
    /**
     * The list of call functions that have been emitted.
     * The items in this array are the number of arguments
     * for each emitted call function.
     */
    callFunctionsEmitted: number[];
    useTex: boolean;
    strict: boolean;
    simplificationMap: Record<string, string>;
    /**
     * Is this a compile step before the actual compile (in other words, is the output ignored)?
     */
    preCompile: boolean;
    /**
     * If true, stops the compile process early.
     */
    shouldExit: {value: boolean};
    /**
     * Function Name -> Is It Enabled
     */
    enableFunctions: Record<string, boolean>;
    /**
     * A stack of the folders that things should be stored in.
     * Only the last item will actually apply.
     */
    folderStack: string[];
    /**
     * Are we inside of a loop?
     */
    loopContext: boolean;
}
