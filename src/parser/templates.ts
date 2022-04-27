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
            if (context === TemplateContext.Expression) throw new Error("This template cannot be ran inside of an expression!");
            if (args.length < 1 || (typeof (args[0]) !== "boolean" && typeof (args[0]) !== "number" && typeof (args[0]) !== "string")) throw new Error("A condition is required!");
            if (args.length < 2 || typeof (args[1]) !== "object" || !args[1]["block"]) throw new Error("An if action is required!");

            if (args[0] === true || args[0] === 1 || args[0] === "1") {
                return args[1]["value"];
            }

            if (args.length > 2 && typeof (args[2]) === "object" && args[2]["block"]) return args[2]["value"];
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
        }
    };
}

const readFile = (path: string) => new Promise<string>((resolve, reject) => {
    fs.readFile(path, (err, val) => {
        if(err) return reject(err);
        resolve(val.toString());
    });
});