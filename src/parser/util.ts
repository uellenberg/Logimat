export const HandleName = (name: string): string => {
    //Correct the variable name if it's in the form of \w_\w+.
    if (name.substring(1, 2) === "_") {
        return name[0] + "_{" + name.substring(2).replace(/_/g, "") + "}";
    }

    return name.replace(/_/g, "");
}

export const opMap = {
    "=": "=",
    ">": ">",
    ">=": "\\ge ",
    "=>": "\\ge ",
    "<=": "\\le ",
    "=<": "\\le "
};

export const isNumeric = (num: any) => (typeof(num) === "number" || (typeof(num) === "string" && num.trim() !== "")) && !isNaN(num as number);