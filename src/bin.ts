#!/usr/bin/env node

import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import * as fs from "fs";
import {Compile} from "./parser/compiler";
import path from "path";

yargs(hideBin(process.argv))
    .usage("Logimat compiler")
    .command("$0 <file>", "Compile a Logimat file.", {
        latex: {
            alias: "l",
            default: false,
            type: "boolean",
            describe: "Output the compiled expression(s) in LaTeX form (good for rendering images)."
        },
        nofs: {
            alias: "n",
            default: false,
            type: "boolean",
            describe: "Blocks untrusted filesystem operations (for example, code telling the compiler to load an NPM module). This is not a security feature."
        },
        piecewise: {
            alias: "p",
            default: false,
            type: "boolean",
            describe: "Compiles using piecewise instead of raw math. This can improve performance and readability in Desmos."
        },
        strict: {
            alias: "s",
            default: false,
            type: "boolean",
            describe: "Throws an error if any undefined functions or variables are used."
        }
    }, async (args) => {
        try {
            const file: string = <string>args.file;

            if(!fs.existsSync(file)) return console.error("Error: The specified file does not exist!");
            fs.accessSync(file, fs.constants.R_OK);

            const data = fs.readFileSync(file, "utf-8");
            const compiled = await Compile(data, args.latex, args.nofs, path.resolve(path.dirname(file)), args.piecewise, args.strict);

            if(typeof(compiled) === "string") process.stdout.write(compiled);
            else process.stdout.write(JSON.stringify(compiled));
        } catch(e) {
            process.stderr.write(e.stack);
        }
    })
    .showHelpOnFail(true)
    .help()
    .demandCommand()
    .argv;