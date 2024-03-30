import {HandleName} from "./util";
import {SimplifyExpression} from "./simplify";
import {cleanData, CompileBlock, CompileData, GetStatementsTree} from "./compiler";
import {OuterFunctionDeclaration, Statement} from "./grammar";

export function generateCallFunction(data: CompileData, args: number, compilerOutput: string[]) {
    if (!data.callFunctionsEmitted.includes(args)) {
        // We need to generate a piece of code that does the following:
        // - Puts a returnNum onto the stack.
        // - Puts a returnStackPointer onto the stack.
        // - Puts all of its arguments onto the stack.
        // - Adjusts the stack
        let callCode = `let newStack = s_tack;
                    newStack[newStack[2] + o_ff] = b_ack;
                    newStack[newStack[2] + o_ff + 1] = newStack[2];`;

        for (let i = 0; i < args; i++) {
            callCode += `newStack[newStack[2] + o_ff + ${i} + 2] = a_rg${i};`
        }

        callCode += `newStack[2] = newStack[2] + o_ff;`;
        callCode += `newStack[1] = n_um;`;
        callCode += "newStack";

        // Compile as a stand-alone block.
        const newData = cleanData(data, []);
        const compiled = CompileBlock(GetStatementsTree(callCode), newData, "", 0 /* state */, true, compilerOutput);
        compilerOutput.push(HandleName("c_all" + args) + "(s_{tack},n_{um},b_{ack},o_{ff}" + (args === 0 ? "" : ",") + Array(args).fill(0).map((_, idx) => HandleName("a_rg" + idx)).join(",") + ")=" + SimplifyExpression(compiled, newData.useTex, newData.strict, newData.names.concat("s_tack", "n_um", "b_ack", "o_ff", "a_rrset", ...Array(args).fill(0).map((_, idx) => "a_rg" + idx)), newData.simplificationMap));

        data.callFunctionsEmitted.push(args);
    }
}

export const GetStackSelector = (data: CompileData): string => {
    let code = "";

    const entries = Object.entries(data.stackFunctionMap);
    for (let i = 0; i < entries.length; i++) {
        const [stackNum, functionName] = entries[i];
        const cond = "s_tack[1] == " + stackNum;
        const body = `{ ${functionName}(s_tack) }`;

        if (i === 0) {
            code += `if(${cond}) ${body}`;
        } else {
            code += `else if(${cond}) ${body}`;
        }
    }

    code += "else { s_tack }";

    const compiled = CompileBlock(GetStatementsTree(code), data, "", 0 /* state */, true, []);
    return "r_{un}(s_{tack})=" + SimplifyExpression(compiled, data.useTex, data.strict, data.names.concat("s_tack", ...Object.values(data.stackFunctionMap)), data.simplificationMap);
}

export function createExecutionPoint(data: CompileData) {
    // This needs to be split into its own subfunction.
    const stackIdx = data.stackIdx.value++;
    const stackName = data.parentStackPrefix + "_" + stackIdx;

    // We need this to have the list of next steps, and so that
    // the function returns to the step after this.
    const nextStepName = data.parentStackPrefix + "_" + (stackIdx + 1);
    data.stackNextStateMap[stackName] = nextStepName;
    const nextStepNum = data.stackStateMap[nextStepName];

    let stackNum: number;
    if (stackName in data.stackStateMap) {
        stackNum = data.stackStateMap[stackName];
    } else {
        stackNum = data.globalStackNumber.value++;
        data.stackStateMap[stackName] = stackNum;
    }
    return {nextStepNum, stackNum, stackName};
}

export function CompileStackFunction(data: CompileData, declaration: OuterFunctionDeclaration, out: string[], useTex: boolean, strict: boolean, names: string[], simplificationMap: Record<string, string>) {
    data.parentStackPrefix = declaration.name;
    data.stackContext = true;
    // The +2 is needed to account for the returnStackNum, and to
    // move it one past the end of the stack.
    data.stackOffset = 2;

    const variableCode: Statement[] = [];

    // Add virtual variables for all the arguments.
    // The data is already here, and stackvar doesn't do anything
    // on its own, so this just creates bindings to the values in the stack.
    for (let i = 0; i < declaration.args.length; i++) {
        const argName = declaration.args[i];

        variableCode.push({type: "stackvar", name: argName});
    }

    // First, we need one compile pass to create the stack numbers
    // for each break point.
    // This will produce meaningless output.
    // This clone is needed because variables have unique IDs.
    let tempData = {
        ...data,
        ...structuredClone({
            vars: data.vars,
            variableMap: data.variableMap,
            varIdx: data.varIdx,
            addrIdx: data.addrIdx,
            stackStateMap: data.stackStateMap,
            stackFunctionMap: data.stackFunctionMap,
            stackNextStateMap: data.stackNextStateMap,
            stackIdx: data.stackIdx,
            globalStackNumber: data.globalStackNumber,
            shouldExit: data.shouldExit,
        })
    };

    let stackNumVar = tempData.addrIdx.value++;
    tempData.vars[stackNumVar] = "-1";
    tempData.variableMap["stacknum"] = {idx: stackNumVar, variable: false};
    tempData.preCompile = true;

    CompileBlock([
        ...variableCode,
        // This is here to prevent if statements from complaining
        // about there not being a state set.
        {type: "var", name: "state", expr: {type: "v", args: ["s_tack"]}},
        ...declaration.block,
    ], tempData, "", 0 /* state */, true, out);

    // Now, we need to add the final execution step.
    // This is explained below, but it's essentially the code
    // that makes the function actually return.
    const finalStackIdx = tempData.stackIdx.value++;
    const finalStackName = tempData.parentStackPrefix + "_" + finalStackIdx;

    // This is needed for functions with only one state, as they already have
    // this one generated.
    if(!(finalStackName in tempData.stackStateMap)) {
        tempData.stackStateMap[finalStackName] = tempData.globalStackNumber.value++;
    }

    // Determine the number of break points the function has.
    let newVersions = tempData.globalStackNumber.value - data.globalStackNumber.value;
    let initialStateNum = data.globalStackNumber.value;

    // Now, we need to bring the relevant fields over.
    data.stackStateMap = tempData.stackStateMap;
    data.globalStackNumber = tempData.globalStackNumber;
    data.stackNextStateMap = tempData.stackNextStateMap;
    data.stackFunctionMap = tempData.stackFunctionMap;
    data.callFunctionsEmitted = tempData.callFunctionsEmitted;
    data.stackFunctionMap = tempData.stackFunctionMap;

    // Now, the function needs to be compiled for each different breakpoint
    // that exists.
    // This will create different versions to handle each part of the execution.
    // There will also be a built-in return function that gets called for the last
    // one, and which will be assigned to finalStackNum.
    stackNumVar = data.addrIdx.value++;
    data.variableMap["stacknum"] = {idx: stackNumVar, variable: false};

    const firstStackNum = data.stackStateMap[declaration.name + "_0"];

    // We need to map each state to its next state as a default value.
    // This will ignore our final one, as it doesn't have a next state to map to.
    const numToName: Record<number, string> = Object.fromEntries(Object.entries(data.stackStateMap).map(val => val.reverse()));
    let nextStateSelector = "const s_tack1 = ";

    // If the function only has a single version (the entrypoint),
    // then there's no reason to advance the state.
    // newVersions being 0 means that there were no new versions after
    // the entrypoint.
    if(newVersions !== 0) {
        nextStateSelector += "a_dv(s_tack, ";

        for (let i = 0; i < newVersions; i++) {
            // i == 0 is a special case for the first breakpoint.
            const stackNum = i === 0 ? firstStackNum : (initialStateNum + (i - 1));

            if (i === 0) {
                nextStateSelector += "if(stacknum == " + stackNum + ")";
            } else {
                nextStateSelector += "else if(stacknum == " + stackNum + ")";
            }

            nextStateSelector += "{" + data.stackStateMap[data.stackNextStateMap[numToName[stackNum]]] + "}";
        }
        // This last run runs for return, which doesn't make use of the
        // current stack num, so it won't matter anyway.
        nextStateSelector += "else { 0 });";
    } else {
        nextStateSelector += "s_tack;";
    }

    // This is broken out so that it can be reset to at the end of each breakpoint.
    nextStateSelector += "state = s_tack1;";

    const newStateSelectorParsed = GetStatementsTree(nextStateSelector);
    const functionStatements = [...variableCode, ...newStateSelectorParsed, ...declaration.block];

    for (let i = 0; i <= newVersions; i++) {
        // We need to use cloned data to avoid
        // the state from getting messed up with multiple
        // iterations.
        const clonedData = {
            ...data,
            ...structuredClone({
                vars: data.vars,
                variableMap: data.variableMap,
                varIdx: data.varIdx,
                addrIdx: data.addrIdx,
                stackStateMap: data.stackStateMap,
                stackFunctionMap: data.stackFunctionMap,
                stackNextStateMap: data.stackNextStateMap,
                stackIdx: data.stackIdx,
                globalStackNumber: data.globalStackNumber,
                callFunctionEmitted: data.callFunctionsEmitted,
                shouldExit: data.shouldExit,
            })
        };

        // 0 is a special case for the first execution point.
        const name = declaration.name + "_" + i;
        const stackNum = i === 0 ? firstStackNum : initialStateNum + (i - 1);

        clonedData.vars[stackNumVar] = stackNum.toString();

        if (i === newVersions) {
            // state = r_et(state);
            const returnCode: Statement[] = [
                ...functionStatements,
                {
                    type: "var",
                    name: "state",
                    expr: {
                        type: "f",
                        args: [
                            "r_et",
                            [
                                {type: "v", args: ["state"]}
                            ]
                        ]
                    }
                }
            ];
            out.push(HandleName(name) + "(s_{tack})=" + SimplifyExpression(CompileBlock(returnCode, clonedData, "", 0 /* state */, true, out), useTex, strict, names.concat("s_tack", "a_dv", "r_et").concat(data.callFunctionsEmitted.map(call => "c_all" + call)), simplificationMap));
        } else {
            out.push(HandleName(name) + "(s_{tack})" + "=" + SimplifyExpression(CompileBlock(functionStatements, clonedData, "", 0 /* state */, true, out), useTex, strict, names.concat("s_tack", "a_dv", "r_et").concat(data.callFunctionsEmitted.map(call => "c_all" + call)), simplificationMap));
        }

        data.stackStateMap = clonedData.stackStateMap;
        data.globalStackNumber = clonedData.globalStackNumber;
        data.stackNextStateMap = clonedData.stackNextStateMap;
        data.stackFunctionMap = clonedData.stackFunctionMap;
        data.callFunctionsEmitted = clonedData.callFunctionEmitted;
        data.stackFunctionMap[stackNum] = name;
    }
}