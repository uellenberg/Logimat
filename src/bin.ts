import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import * as fs from "fs";
import {Compile} from "./parser/compiler";

yargs(hideBin(process.argv))
    .usage("Logimat compiler")
    .command("$0 <file>", "Compile a Logimat file.", {
        latex: {
            alias: "l",
            default: false,
            type: "boolean",
            describe: "Output the compiled expression(s) in LaTeX form (good for rendering images)"
        }
    }, (args) => {
        const file: string = <string>args.file;

        if(!fs.existsSync(file)) return console.error("Error: The specified file does not exist!");
        fs.accessSync(file, fs.constants.R_OK);

        const data = fs.readFileSync(file, "utf-8");
        const compiled = Compile(data, args.latex);

        process.stdout.write(compiled);
    })
    .showHelpOnFail(true)
    .help()
    .demandCommand()
    .argv;