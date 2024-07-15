import {HandleName} from "./util";
import {SimplifyExpression} from "./simplify";
import {cleanData, CompileBlock, CompileData, getNumToName, GetStatementsTree} from "./compiler";
import {StackFunctionDeclaration, Statement} from "./grammar";

export function generateCallFunction(data: CompileData, args: number, compilerOutput: string[]) {
    if (!data.callFunctionsEmitted.includes(args)) {
        // We need to generate a piece of code that does the following:
        // - Puts a returnNum onto the stack.
        // - Puts a returnStackPointer onto the stack.
        // - Puts all of its arguments onto the stack.
        // - Adjusts the stack
        let callCode = `let newStack = s_tack;
                    newStack[s_tack[2] + o_ff] = b_ack;
                    newStack[s_tack[2] + o_ff + 1] = s_tack[2];`;

        for (let i = 0; i < args; i++) {
            callCode += `newStack[s_tack[2] + o_ff + ${i} + 2] = a_rg${i};`
        }

        callCode += `newStack[2] = s_tack[2] + o_ff;`;
        callCode += `newStack[1] = n_um;`;
        callCode += "newStack";

        // Compile as a stand-alone block.
        const newData = cleanData(data, []);
        const compiled = CompileBlock(GetStatementsTree(callCode), newData, "", 0 /* state */, true, compilerOutput);
        compilerOutput.push(HandleName("c_all" + args) + "(s_{tack},n_{um},b_{ack},o_{ff}" + (args === 0 ? "" : ",") + Array(args).fill(0).map((_, idx) => HandleName("a_rg" + idx)).join(",") + ")=" + SimplifyExpression(compiled, newData.useTex, newData.strict, newData.names.concat("s_tack", "n_um", "b_ack", "o_ff", "a_rrset", ...Array(args).fill(0).map((_, idx) => "a_rg" + idx)), newData.simplificationMap, true));

        data.callFunctionsEmitted.push(args);
    }
}

export const GetStackSelector = (data: CompileData): string => {
    const stackIds = Object.keys(data.stackFunctionMap).map(Number);

    // This needs to be in ascending order, starting with 0, and with
    // no holes.
    // We need to sort to ensure the first property, and the last two should
    // be guaranteed, but everything will break if they're violated, so we'll
    // check.
    stackIds.sort((a, b) => a > b ? 1 : -1);

    // Duplicates are not possible since this comes from an Object.
    if(stackIds[0] !== 0 || stackIds[stackIds.length - 1] !== stackIds.length - 1) {
        throw new Error("A hole is not allowed in stack IDs");
    }

    const binarySearch = (left: number, right: number) : string => {
        if(left === right || right < left) {
            const functionName = data.stackFunctionMap[left];
            return `${functionName}(s_tack)`;
        }

        // We can just use a simple comparison if there are two.
        if(right - left === 1) {
            return `if(s_tack[1] == ${left}) { ${binarySearch(left, left)} } else { ${binarySearch(right, right)} }`;
        }

        const middle = Math.floor((right - left) / 2) + left;
        return `if(s_tack[1] < ${middle}) { ${binarySearch(left, middle - 1)} } else { ${binarySearch(middle, right)} }`;
    };

    const code = binarySearch(0, stackIds.length - 1);

    const compiled = CompileBlock(GetStatementsTree(code), data, "", 0 /* state */, true, []);
    return "r_{unstack}(s_{tack})=" + SimplifyExpression(compiled, data.useTex, data.strict, data.names.concat("s_tack", ...Object.values(data.stackFunctionMap)), data.simplificationMap, true);
}

export function createExecutionPoint(data: CompileData, nextStateName?: string, noNextState?: boolean) {
    // This needs to be split into its own subfunction.
    const stackIdx = data.stackIdx.value++;
    const stackName = data.parentStackPrefix + "_" + stackIdx;

    data.stackParentLastMap[data.parentStackPrefix] = stackName;

    // We need this to have the list of next steps, and so that
    // the function returns to the step after this.
    const nextStepName = data.stackNextStateMap[stackName] ?? (nextStateName ?? (data.parentStackPrefix + "_" + (stackIdx + 1)));
    if(!noNextState) data.stackNextStateMap[stackName] = nextStepName;
    const nextStepNum = data.stackStateMap[nextStepName];

    let stackNum: number;
    if (stackName in data.stackStateMap) {
        stackNum = data.stackStateMap[stackName];
    } else {
        stackNum = data.globalStackNumber.value++;
        data.stackStateMap[stackName] = stackNum;
    }

    // This should track the latest globalStackNumber, but
    // shouldn't move into the future, so we'll use
    // stackNum + 1 (which is what globalStackNumber will be
    // the first time this runs in a pre-compile).
    if(data.localStackNumber.value < stackNum + 1) {
        data.localStackNumber.value = stackNum + 1;
    }

    return {nextStepNum, stackNum, stackName, nextStepName};
}

export function CompileStackFunction(data: CompileData, declaration: StackFunctionDeclaration, out: string[], useTex: boolean, strict: boolean, names: string[], simplificationMap: Record<string, string>, compiledDisplay: string[]) {
    data.parentStackPrefix = declaration.name;
    data.stackContext = true;
    // The +2 is needed to account for the returnStackNum, and to
    // move it one past the end of the stack.
    data.stackOffset = 2;
    // Start localStackNum at name_0 so that
    // code using it only gets numbers
    // within this function.
    data.localStackNumber.value = data.stackStateMap[declaration.name + "_0"];

    // Create the stack variable (we need to know its ID so we can request it).
    const stackVarAddrIdx = data.addrIdx.value++;
    data.variableMap["stack"] = {idx: stackVarAddrIdx, variable: true};
    data.vars[stackVarAddrIdx] = "s_tack";

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
            localStackNumber: data.localStackNumber,
            callFunctionEmitted: data.callFunctionsEmitted,
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
    ], tempData, "", stackVarAddrIdx, true, out);

    // Now, we need to add the final execution step.
    // This is explained below, but it's essentially the code
    // that makes the function actually return.
    const finalStackIdx = tempData.stackIdx.value++;
    const finalStackName = tempData.parentStackPrefix + "_" + finalStackIdx;

    // This is needed for functions with only one state, as they already have
    // this one generated.
    if(!(finalStackName in tempData.stackStateMap)) {
        tempData.stackStateMap[finalStackName] = tempData.globalStackNumber.value++;
        tempData.localStackNumber.value++;
    }

    // Determine the number of break points the function has.
    let newVersions = tempData.globalStackNumber.value - data.globalStackNumber.value;
    let initialStateNum = data.globalStackNumber.value;

    // Now, we need to bring the relevant fields over.
    data.stackStateMap = tempData.stackStateMap;
    data.globalStackNumber = tempData.globalStackNumber;
    // localStackNum isn't cloned here because it needs
    // to be reset before each subfunction compile.
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

    const numToName = getNumToName(data);

    for (let i = 0; i <= newVersions; i++) {
        // Include the display for each subfunction (for folders).
        out.push(...compiledDisplay);

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
                localStackNumber: data.localStackNumber,
                callFunctionEmitted: data.callFunctionsEmitted,
                shouldExit: data.shouldExit,
            })
        };

        // 0 is a special case for the first execution point.
        const name = declaration.name + "_" + i;
        const stackNum = i === 0 ? firstStackNum : initialStateNum + (i - 1);

        clonedData.vars[stackNumVar] = stackNum.toString();

        // We need to map each state to its next state as a default value.
        // This will ignore our final one, as it doesn't have a next state to map to.
        let nextStateAdv = "";

        // If the function only has a single version (the entrypoint),
        // then there's no reason to advance the state.
        // newVersions being 0 means that there were no new versions after
        // the entrypoint.
        if(newVersions !== 0 && i !== newVersions) {
            nextStateAdv += "a_dv(s_tack, " + data.stackStateMap[data.stackNextStateMap[numToName[stackNum]]] + ")";
        } else {
            nextStateAdv += "s_tack";
        }

        let nextStateSelector = "const s_tack1 = " + nextStateAdv + ";";

        // This is broken out so that it can be reset to at the end of each breakpoint.
        nextStateSelector += "state = s_tack1;";
        nextStateSelector += "stack = s_tack1;";

        const newStateSelectorParsed = GetStatementsTree(nextStateSelector);
        const functionStatements = [...variableCode, ...newStateSelectorParsed, ...declaration.block];

        let runCode: Statement[];
        let fallbackOutput: string;

        if (i === newVersions) {
            // This is the default return if the function does nothing.
            // In that case, it'll just be reset and have its compiled output equal to "".
            // This replaces that empty output.
            fallbackOutput = "r_et(s_tack)";

            // state = r_et(state);
            runCode = [
                ...functionStatements,
                {
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
                }
            ];
        } else {
            fallbackOutput = nextStateAdv;
            runCode = functionStatements;
        }

        out.push(HandleName(name) + "(s_{tack})=" + SimplifyExpression(CompileBlock(runCode, clonedData, "", stackVarAddrIdx, true, out) || fallbackOutput, useTex, strict, names.concat("s_tack", "a_dv", "r_et").concat(data.callFunctionsEmitted.map(call => "c_all" + call)), simplificationMap, true));

        data.stackStateMap = clonedData.stackStateMap;
        data.globalStackNumber = clonedData.globalStackNumber;
        data.stackNextStateMap = clonedData.stackNextStateMap;
        data.stackFunctionMap = clonedData.stackFunctionMap;
        data.callFunctionsEmitted = clonedData.callFunctionEmitted;
        data.stackFunctionMap[stackNum] = name;
    }

    // Fix localStackNumber.
    data.localStackNumber.value = data.globalStackNumber.value;
}