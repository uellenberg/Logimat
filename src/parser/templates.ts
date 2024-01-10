import {LogimatTemplateState, TemplateContext, TemplateFunction, TemplateModule} from "../types";
import path from "path";
import {HandleName} from "./util";
import fs from "fs";

export function createTemplates(noFS: boolean, state: LogimatTemplateState, importMap: Record<string, TemplateModule | string>) : Record<string, TemplateFunction> {
    return {
        import: async (args, state1: LogimatTemplateState, context) => {
            if (noFS) throw new Error("Import failed: filesystem operations have been disabled.");
            if (context !== TemplateContext.OuterDeclaration) throw new Error("The import template can only be used outside of any methods!");
            if (args.length < 1 || typeof (args[0]) !== "string" || !args[0]) throw new Error("A path to the file to import must be defined!");

            const importPath = args[0];
            const realPath = path.isAbsolute(importPath) || state.logimat.files.length < 1 ? importPath : path.join(path.dirname(state.logimat.files[state.logimat.files.length - 1]), importPath);

            //This uses a bit of "compiler magic". Basically, we use templates to keep track of files, but our template resolver doesn't actually mark
            //setFile as a template, so it will stop resolving templates once all templates that aren't setFile are gone. This way, the file boundaries will
            //persist, but won't create an infinite loop of template resolution.

            if (importMap.hasOwnProperty(realPath)) {
                const val = importMap[realPath];
                if (typeof (val) !== "string") throw new Error("Expected \"" + realPath + "\" to be a string but got \"" + typeof (val) + "\" instead.");

                return "setFile!(\"" + realPath + "\");" + val + "setFile!();";
            }

            const val = await readFile(realPath);
            importMap[realPath] = val;

            return "setFile!(\"" + realPath + "\");" + val + "setFile!();";
        },
        setfile: (args, state1: LogimatTemplateState, context) => {
            //If we have an argument, push it, otherwise remove the current path.
            if (typeof (args[0]) === "string") state1.logimat.files.push(args[0]);
            else state1.logimat.files.pop();

            return "";
        },
        iterate: (args, state1: LogimatTemplateState, context) => {
            if (args.length < 1 || typeof (args[0]) !== "object" || !args[0]["block"]) throw new Error("A block to iterate is required!");
            if (args.length < 2 || typeof (args[1]) !== "number" || isNaN(args[1]) || args[1] < 1) throw new Error("A number specifying the number of times to iterate is required!");

            let output = "";

            if (args.length > 2 && typeof (args[2]) === "boolean" && args[2]) {
                output += "[";

                for (let i = 0; i < args[1]; i++) {
                    output += "{" + args[0]["value"] + "}";
                    if (i !== args[1] - 1) output += ",\n";
                }

                output += "]";
            } else {
                if (context === TemplateContext.Expression) throw new Error("In order to use iterate inside of expressions, you must set it to output an array (by setting the third argument to \"true\").");

                for (let i = 0; i < args[1]; i++) {
                    output += args[0]["value"];
                    if (i !== args[1] - 1) output += "\n";
                }
            }

            return output;
        },
        define: (args, state1: LogimatTemplateState, context) => {
            if (context === TemplateContext.Expression) throw new Error("This template cannot be ran outside of an expression!");
            if (args.length < 1 || typeof (args[0]) !== "string" || !args[0]) throw new Error("A name is required!");
            if (args.length < 2) throw new Error("A value is required!");

            state1.logimat.definitions[args[0]] = args[1];

            return "";
        },
        get: (args, state1: LogimatTemplateState, context) => {
            if (context !== TemplateContext.Expression) throw new Error("This template cannot be ran outside of an expression!");
            if (args.length < 1 || typeof (args[0]) !== "number") throw new Error("A name is required!");

            return args[0].toString();
        },
        concat: (args, state1: LogimatTemplateState, context) => {
            if (context !== TemplateContext.Expression) throw new Error("This template cannot be ran outside of an expression!");

            let result = "";

            for (const part of args) {
                if (typeof (part) !== "string" && typeof (part) !== "number") throw new Error("This template can only be used with strings and numbers!");
                result += part;
            }

            return result;
        },
        if: (args, state1: LogimatTemplateState, context) => {
            if (args.length < 1 || (typeof (args[0]) !== "boolean" && typeof (args[0]) !== "number" && typeof (args[0]) !== "string")) throw new Error("A condition is required!");
            if (args.length < 2 || typeof (args[1]) !== "object" || !args[1]["block"]) throw new Error("An if action is required!");

            const wrap = context === TemplateContext.Expression;
            const wrapL = wrap ? "{" : "";
            const wrapR = wrap ? "}" : "";

            // True
            if (args[0] === true || args[0] === 1 || args[0] === "1") {
                return wrapL + args[1]["value"] + wrapR;
            }

            // False
            if (args.length > 2 && typeof (args[2]) === "object" && args[2]["block"]) return wrapL + args[2]["value"] + wrapR;

            // False with no else action.
            if(wrap) throw new Error("An else is required for if statements which return expressions!");
            return "";
        },
        parse: (args, state1: LogimatTemplateState, context) => {
            if (context !== TemplateContext.Expression) throw new Error("This template can only be ran inside of an expression!");
            if (args.length < 1 || typeof (args[0]) !== "string" || !args[0]) throw new Error("A value to parse is required!");

            return HandleName(args[0]);
        },
        wrap: (args, state1: LogimatTemplateState, context) => {
            if (context !== TemplateContext.Expression) throw new Error("This template can only be ran inside of an expression!");
            if (args.length < 1 || typeof (args[0]) !== "string" || !args[0]) throw new Error("A value to wrap is required!");

            return "${" + args[0] + "}";
        },
        complexfunction: (args, state1: LogimatTemplateState, context) => {
            if (context !== TemplateContext.Expression) throw new Error("This template can only be ran inside of an expression!");
            if (args.length < 1 || typeof (args[0]) !== "number" || isNaN(args[0])) throw new Error("A version number is required!");
            if (args.length < 2 || typeof (args[1]) !== "number" || isNaN(args[1])) throw new Error("A function number is required!");
            if (args.length < 3 || typeof (args[2]) !== "string" || !args[2]) throw new Error("A curVal string is required!");
            if (args.length < 4 || typeof (args[3]) !== "string" || !args[3]) throw new Error("A pos string is required!");
            if (args.length < 5 || typeof (args[4]) !== "string" || !args[4]) throw new Error("An iter string is required!");

            // TODO: Implement versioning.
            const version = args[0];
            const func = [...args[1].toString()].map(a => parseInt(a));
            const curVal = args[2];
            const pos = args[3];
            const iter = args[4];

            // The complex function generator works by using a simple context-free grammar.
            // This grammar works on functions, numbers, and the variables given to this function.
            // The grammar is as follows:
            //
            // Start = ComplexFunction
            //
            // ComplexValue = ComplexFunction | ComplexNumber | [curVal] | [pos]
            // RealValue = RealFunction | RealNumber | [iter]
            //
            // ComplexFunction = CFunctionC | CCFunctionC | CRFunctionC | RCFunctionC | RRFunctionC
            // RealFunction = CFunctionR
            //
            // CFunctionC = [list] "(" ComplexValue ")"
            // CCFunctionC = [list] "(" ComplexValue "," ComplexValue ")"
            // CRFunctionC = [list] "(" ComplexValue "," RealValue ")"
            // RCFunctionC = [list] "(" RealValue "," ComplexValue ")"
            // RRFunctionC = [list] "(" RealValue "," RealValue ")"
            //
            // CFunctionR = [list] "(" ComplexValue ")"
            // ROpFunction = [list] RealValue op RealValue
            //
            // ComplexNumber = "(" RealValue "," RealValue ")"
            // RealNumber = [random number]
            // op = "+" | "-" | "*" | "/" | "^"

            const cFcList = ["cExp", "cLn", "cSin", "cCos", "cTan", "cCot", "cSinh", "cCosh", "cTanh", "cCoth", "cFloor", "cCeil", "cRound"];
            const ccFcList = ["cMul", "cDiv", "cAdd", "cSub", "cPow", "cLog", "cMod"];
            const crFcList = ["cPowCR"];
            const rcFcList = ["cPowRC"];
            const rrFcList = ["cPolar"];

            const cFrList = ["cR", "cI", "cAbs", "cArg"];
            const rOpFunctionList = ["+", "-", "*", "/", "^"];

            let idx = 0;

            /**
             * Generates a random number between [0, 1).
             */
            const rand = () => {
                // Generate a seed from the idx.
                const seed = func[idx % (func.length-1)] + idx;
                idx++;

                // Generate a random number.
                return mulberry32(xmur3(seed.toString())())();
            };

            /**
             * Picks a random element using the function number.
             * @param arr {((() => string) | string)[]} - is the ending index (exclusive).
             */
            const pick = (arr: ((() => string) | string)[]) : string => {
                // We can multiply by the range to get the random number.
                const index = Math.floor(rand() * arr.length);

                // Finally, select.
                const el = arr[index];

                if(typeof el === "function") return el();
                return el;
            };

            // Make terminals impossible at the start, but slowly
            // increase their likelihood as we go.
            const terminalIncrement = .5;
            let numTerminals = -terminalIncrement;

            const ComplexValue = () : string => {
                numTerminals+=terminalIncrement;

                return pick([ComplexFunction, ...new Array(Math.floor(numTerminals)).fill([ComplexNumber, curVal, pos]).flatMap(a => a)]);
            };
            const RealValue = () : string => {
                numTerminals+=terminalIncrement;

                return pick([RealFunction, ...new Array(Math.floor(numTerminals)).fill([RealNumber, iter]).flatMap(a => a)]);
            };

            // Pick probabilities based on the total number of functions and not categories.
            const ComplexFunction = () : string => pick([
                ...cFcList.map(() => CFunctionC),
                ...ccFcList.map(() => CCFunctionC),
                ...crFcList.map(() => CRFunctionC),
                ...rcFcList.map(() => RCFunctionC),
                ...rrFcList.map(() => RRFunctionC),
            ]);
            const RealFunction = () : string => pick([
                ...cFrList.map(() => CFunctionR),
                ...rOpFunctionList.map(() => ROpFunction),
            ]);

            const CFunctionC = () : string => `${pick(cFcList)}(${ComplexValue()})`;
            const CCFunctionC = () : string => `${pick(ccFcList)}(${ComplexValue()},${ComplexValue()})`;
            const CRFunctionC = () : string => `${pick(crFcList)}(${ComplexValue()},${RealValue()})`;
            const RCFunctionC = () : string => `${pick(rcFcList)}(${RealValue()},${ComplexValue()})`;
            const RRFunctionC = () : string => `${pick(rrFcList)}(${RealValue()},${RealValue()})`;

            const CFunctionR = () : string => `${pick(cFrList)}(${ComplexValue()})`;
            const ROpFunction = () : string => `(${RealValue()}${pick(rOpFunctionList)}${RealValue()})`;
            // TODO: Maybe implement more real functions.

            const ComplexNumber = () : string => `(${RealValue()},${RealValue()})`;
            const RealNumber = () : string => ((rand() - .5) * 10).toString();

            return ComplexFunction();
        },
    };
}

const readFile = (path: string) => new Promise<string>((resolve, reject) => {
    fs.readFile(path, (err, val) => {
        if(err) return reject(err);
        resolve(val.toString());
    });
});

/**
 * Random seed generator. Source: https://stackoverflow.com/a/47593316.
 */
function xmur3(str: string) : () => number {
    for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    } return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

/**
 * Random number generator. Source: https://stackoverflow.com/a/47593316.
 */
function mulberry32(a: number) : () => number {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}
