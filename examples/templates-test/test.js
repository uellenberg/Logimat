exports.templates = {
    test1: {
        function: (args) => {
            return "export const t_est2 = " + args[0] + ";";
        }
    },
    test2: {
        function: (args) => {
            return "state = " + args[0] + ";";
        }
    }
}