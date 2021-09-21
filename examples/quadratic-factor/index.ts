import {Compile} from "../../src";
import * as fs from "fs";
import * as Path from "path";

const func = Compile(fs.readFileSync(Path.join(__dirname, "quadratic-factor.lm"), "utf-8"));

process.stdout.write(func);