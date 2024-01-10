import ohm from "ohm-js";
import {TemplateBlock, TemplateContext} from "../types";

export const grammar = ohm.grammar(`
//Based on https://github.com/harc/ohm/blob/master/examples/ecmascript/src/es5.ohm.

Logimat {
    Program = Import* OuterDeclaration*
    
    Import = ImportTemplates
    ImportTemplates = "import" #space "templates" #space "from" #space string ";"
    
    OuterDeclaration = DefineTemplate | Template | OuterConstDeclaration | FunctionDeclaration | ExportDeclaration | ActionDeclaration | ActionsDeclaration | ExpressionDeclaration | GraphDeclaration | PointDeclaration | PolygonDeclaration | DisplayDeclarations
    
    Template = templateName "(" TemplateArgs ")" ";"
    InnerTemplate = templateName "(" TemplateArgs ")" ";"
    
    DefineTemplate = "define!" "(" TemplateIdentifier "," TemplateArg ")" ";"
    InnerDefineTemplate = "define!" "(" TemplateIdentifier "," TemplateArg ")" ";"

    OuterConstDeclaration = ExportOuterConstDeclaration | InlineOuterConstDeclaration | PointDeclaration
    ExportOuterConstDeclaration = export #space const #space TemplateExportIdentifier "=" Expression ";"
    InlineOuterConstDeclaration = inline #space const #space TemplateIdentifier "=" Expression ";"

    FunctionDeclaration = ExportFunctionDeclaration | InlineFunctionDeclaration | InlinePolyfillFunctionDeclaration
    ExportFunctionDeclaration = export #space function #space TemplateExportIdentifier "(" ExportFunctionArgs ")" FunctionBody
    InlineFunctionDeclaration = inline #space function #space TemplateIdentifier "(" FunctionArgs ")" FunctionBody
    InlinePolyfillFunctionDeclaration = inline #space polyfill #space function #space TemplateIdentifier "(" FunctionArgs ")" FunctionBody
    
    ExportDeclaration =  export #space TemplateIdentifier ";"

    ActionDeclaration = UnnamedActionDeclaration | NamedActionDeclaration
    UnnamedActionDeclaration = action #space TemplateExportIdentifier FunctionBody
    NamedActionDeclaration = NoArgsActionDeclaration | ArgsActionDeclaration
    NoArgsActionDeclaration = action #space TemplateExportIdentifier "=" TemplateExportIdentifier FunctionBody
    ArgsActionDeclaration = action #space TemplateExportIdentifier "(" ExportFunctionArgs ")" "=" TemplateExportIdentifier FunctionBody
    
    ActionsDeclaration = NoArgsActionsDeclaration | ArgsActionsDeclaration
    NoArgsActionsDeclaration = actions #space TemplateExportIdentifier "=" ActionsArgs ";"
    ArgsActionsDeclaration = actions #space TemplateExportIdentifier "(" ExportFunctionArgs ")" "=" ActionsArgs ";"
    
    ExpressionDeclaration = expression FunctionBody
    
    GraphDeclaration = graph ExpressionBlock GraphOperator ExpressionBlock ";"
    GraphOperator = ">="
                  | "=>"
                  | "<="
                  | "=<"
                  | "="
                  | ">"
                  | "<"
    
    PointDeclaration = point Expression ";"
    
    PolygonDeclaration = polygon "(" ListOf<Expression, ","> ")" ";"
    
    DisplayDeclaration<type, value> = display type "=" value ";"
    DisplayDeclarations = DisplayDeclaration<"color", (parsedExportIdentifier | parsedTemplateString)>
                        | DisplayDeclaration<"stroke", Expression>
                        | DisplayDeclaration<"thickness", Expression>
                        | DisplayDeclaration<"fill", Expression>
                        | DisplayDeclaration<"click", (ParsedActionArgs | parsedExportIdentifier | parsedTemplateString)>
                        | DisplayDeclaration<"label", embeddedTemplateString>
                        | DisplayDeclaration<"drag", ("x" | "y" | "xy")>
                        | DisplayDeclaration<"hidden", boolean>
                        | DisplayDeclaration<"outline", boolean>
                        | DisplayDeclaration<"angle", Expression>
                        | DisplayDeclaration<"size", Expression>
                        | DisplayDeclaration<"min", Expression>
                        | DisplayDeclaration<"max", Expression>
                        | DisplayDeclaration<"step", Expression>
    ParsedActionArgs = TemplateExportIdentifier "(" ListOf<("index" | Expression), ","> ")"
    
    parsedTemplateString = "\\"" (parsedTemplateStringTemplate | stringCharacter)* "\\""
    parsedTemplateStringTemplate = ~("\\"" | "\\\\" | lineTerminator) "\${" applySyntactic<Expression> "}"
    
    embeddedTemplateString = "\\"" (embeddedTemplateStringTemplate | stringCharacter)* "\\""
    embeddedTemplateStringTemplate = ~("\\"" | "\\\\" | lineTerminator) "\${" applySyntactic<Expression> "}"
    
    parsedExportIdentifier = exportIdentifier
    
    Point = "(" Expression "," Expression ")"
    Array = "[" ListOf<Expression, ","> "]"
    
    ExportFunctionArgs = ListOf<TemplateExportIdentifier, ",">
    FunctionArgs = ListOf<TemplateIdentifier, ",">
    TemplateArgs = ListOf<TemplateArg, ",">
    FunctionBody = Block -- block
                 | "=>" Expression ";" -- arrow
    
    ActionName (an action name) = TemplateExportIdentifier ("(" ExportFunctionArgs ")")?
    ActionsArgs = ListOf<ActionName, ",">
    
    TemplateArg = string  -- string
                | boolean -- boolean
                | null    -- null
                | "{" (OuterDeclaration+ | InnerDeclarations) "}"   -- block
                | Expression -- expression
    
    ExpressionBlock = "{" Expression "}"
    Block = "{" InnerDeclarations "}"
    InnerDeclarations = InnerDeclaration+ SetStateImplicit? -- inner
                      | SetStateImplicit -- state
    
    InnerDeclaration = InnerDefineTemplate
                     | InnerTemplate
                     | ConstDeclaration
                     | LetDeclaration
                     | LetDeclarationEmpty
                     | SetVar
                     | IfStatement

    ConstDeclaration = const #space TemplateIdentifier "=" Expression ";"
    LetDeclaration = let #space TemplateIdentifier "=" Expression ";"
    LetDeclarationEmpty = let #space TemplateIdentifier ";"

    SetStateImplicit = Expression
    
    SetVar = identifier "=" Expression ";"

    StateBlock = Block -- block

    IfStatement = if "(" Expression ")" StateBlock (else (StateBlock | IfStatement))?
    
    Ternary = Expression "?" Expression ":" Expression

    Sum = sum "(" TemplateIdentifier "=" Expression ";" Expression ")" StateBlock
    Prod = prod "(" TemplateIdentifier "=" Expression ";" Expression ")" StateBlock
    Integral = integral "(" TemplateIdentifier "=" Expression ";" Expression ")" StateBlock
    Derivative = derivative "(" TemplateIdentifier ")" StateBlock
    
    PrimaryExpression = IfStatement -- if
                      | templateName "(" TemplateArgs ")"   -- template
                      | "log_" (literal | PrimaryExpression_var) "(" Expression ")" -- log
                      | Sum
                      | Prod
                      | Integral
                      | Derivative
                      | TemplateIdentifierName "(" ListOf<Expression, ","> ")"   -- func
                      | TemplateIdentifier  -- var
                      | literal
                      | Block  -- block
                      | Array  -- array
                      | Point  -- point
                      | "(" Expression ")"  -- paren
    
    MemberExpression = MemberExpression "[" Expression "]" -- arrayIdx
                     | MemberExpression "." ("x" | "y")    -- pointIdx
                     | MemberExpression "." "length"       -- arrayLength
                     | MemberExpression "." "filter" "(" TemplateIdentifier "=>" (Block | Expression) ")"  -- filter
                     | MemberExpression "." "map" "(" TemplateIdentifier "=>" (Block | Expression) ")"  -- map
                     | PrimaryExpression
    
    UnaryExpression = "+" UnaryExpression -- plus
                    | "-" UnaryExpression -- neg
                    | "!" UnaryExpression -- not
                    | MemberExpression
    
    ExponentialExpression = ExponentialExpression "^" UnaryExpression -- exp
                          | UnaryExpression
    
    MultiplicativeExpression = MultiplicativeExpression "*" ExponentialExpression -- mul
                             | MultiplicativeExpression "/" ExponentialExpression -- div
                             | MultiplicativeExpression "%" ExponentialExpression -- mod
                             | ExponentialExpression
    
    AdditiveExpression = AdditiveExpression "+" MultiplicativeExpression -- add
                       | AdditiveExpression "-" MultiplicativeExpression -- sub
                       | MultiplicativeExpression 
    
    RelationalExpression = RelationalExpression "<" AdditiveExpression            -- lt
                         | RelationalExpression ">" AdditiveExpression            -- gt
                         | RelationalExpression ("<=" | "=<") AdditiveExpression  -- lte
                         | RelationalExpression (">=" | "=>") AdditiveExpression  -- gte
                         | AdditiveExpression
    
    EqualityExpression = EqualityExpression "==" RelationalExpression -- equal
                       | EqualityExpression "!=" RelationalExpression -- notEqual
                       | RelationalExpression
    
    AndExpression = AndExpression "&&" EqualityExpression -- and
                  | EqualityExpression
    
    OrExpression = OrExpression "||" AndExpression -- or
                 | AndExpression
    
    TernaryExpression = Ternary | OrExpression
    
    Expression = TernaryExpression

    literal = numericLiteral | booleanLiteral
    
    booleanLiteral = boolean

    numericLiteral = decimalLiteral

    decimalLiteral = decimalIntegerLiteral "." decimalDigit* -- bothParts
                   |                       "." decimalDigit+ -- decimalsOnly
                   | decimalIntegerLiteral                   -- integerOnly

    decimalIntegerLiteral = nonZeroDigit decimalDigit*  -- nonZero
                          | "0"                         -- zero
    decimalDigit = "0".."9"
    nonZeroDigit = "1".."9"

    export = "export" ~identifierPart
    inline = "inline" ~identifierPart
    const = "const" ~identifierPart
    let = "let" ~identifierPart
    function = "function" ~identifierPart
    polyfill = "polyfill" ~identifierPart
    action = "action" ~identifierPart
    actions = "actions" ~identifierPart
    expression = "expression" ~identifierPart
    graph = "graph" ~identifierPart
    point = "point" ~identifierPart
    array = "array" ~identifierPart
    polygon = "polygon" ~identifierPart
    sum = "sum" ~identifierPart
    prod = "prod" ~identifierPart
    integral = "integral" ~identifierPart
    derivative = "derivative" ~identifierPart
    if = "if" ~identifierPart
    else = "else" ~identifierPart
    boolean = ("true" | "false") ~identifierPart
    null = "null" ~identifierPart
    display = "display" ~identifierPart

    keywords = export
             | inline
             | const
             | let
             | function
             | action
             | actions
             | expression
             | graph
             | point
             | array
             | polygon
             | sum
             | prod
             | integral
             | derivative
             | if
             | else
             | boolean
             | null
             | display

    reservedWord = keywords

    TemplateIdentifier = identifier | templateString
    TemplateExportIdentifier = exportIdentifier | templateString
    TemplateIdentifierName = identifierName | templateString
    
    templateString = "\\"" (templateStringTemplate | stringCharacter)* "\\""
    templateStringTemplate = ~("\\"" | "\\\\" | lineTerminator) "\${" applySyntactic<Expression> "}"

    exportIdentifier (a single character identifier) = ~reservedWord "a".."z" ("_" ("a".."z" | "0".."9" | "_")+)?

    identifier (an identifier) = ~reservedWord identifierName
    identifierName (an identifier) = letter identifierPart*
    
    templateName (an identifier) = identifierName "!"

    identifierPart = letter | unicodeCombiningMark
                   | unicodeDigit | unicodeConnectorPunctuation
                   | "\u200C" | "\u200D"
    letter += unicodeCategoryNl
    unicodeCategoryNl
      = "\u2160".."\u2182" | "\u3007" | "\u3021".."\u3029"
    unicodeDigit (a digit)
      = "\u0030".."\u0039" | "\u0660".."\u0669" | "\u06F0".."\u06F9" | "\u0966".."\u096F" | "\u09E6".."\u09EF" | "\u0A66".."\u0A6F" | "\u0AE6".."\u0AEF" | "\u0B66".."\u0B6F" | "\u0BE7".."\u0BEF" | "\u0C66".."\u0C6F" | "\u0CE6".."\u0CEF" | "\u0D66".."\u0D6F" | "\u0E50".."\u0E59" | "\u0ED0".."\u0ED9" | "\u0F20".."\u0F29" | "\uFF10".."\uFF19"

    unicodeCombiningMark (a Unicode combining mark)
      = "\u0300".."\u0345" | "\u0360".."\u0361" | "\u0483".."\u0486" | "\u0591".."\u05A1" | "\u05A3".."\u05B9" | "\u05BB".."\u05BD" | "\u05BF".."\u05BF" | "\u05C1".."\u05C2" | "\u05C4".."\u05C4" | "\u064B".."\u0652" | "\u0670".."\u0670" | "\u06D6".."\u06DC" | "\u06DF".."\u06E4" | "\u06E7".."\u06E8" | "\u06EA".."\u06ED" | "\u0901".."\u0902" | "\u093C".."\u093C" | "\u0941".."\u0948" | "\u094D".."\u094D" | "\u0951".."\u0954" | "\u0962".."\u0963" | "\u0981".."\u0981" | "\u09BC".."\u09BC" | "\u09C1".."\u09C4" | "\u09CD".."\u09CD" | "\u09E2".."\u09E3" | "\u0A02".."\u0A02" | "\u0A3C".."\u0A3C" | "\u0A41".."\u0A42" | "\u0A47".."\u0A48" | "\u0A4B".."\u0A4D" | "\u0A70".."\u0A71" | "\u0A81".."\u0A82" | "\u0ABC".."\u0ABC" | "\u0AC1".."\u0AC5" | "\u0AC7".."\u0AC8" | "\u0ACD".."\u0ACD" | "\u0B01".."\u0B01" | "\u0B3C".."\u0B3C" | "\u0B3F".."\u0B3F" | "\u0B41".."\u0B43" | "\u0B4D".."\u0B4D" | "\u0B56".."\u0B56" | "\u0B82".."\u0B82" | "\u0BC0".."\u0BC0" | "\u0BCD".."\u0BCD" | "\u0C3E".."\u0C40" | "\u0C46".."\u0C48" | "\u0C4A".."\u0C4D" | "\u0C55".."\u0C56" | "\u0CBF".."\u0CBF" | "\u0CC6".."\u0CC6" | "\u0CCC".."\u0CCD" | "\u0D41".."\u0D43" | "\u0D4D".."\u0D4D" | "\u0E31".."\u0E31" | "\u0E34".."\u0E3A" | "\u0E47".."\u0E4E" | "\u0EB1".."\u0EB1" | "\u0EB4".."\u0EB9" | "\u0EBB".."\u0EBC" | "\u0EC8".."\u0ECD" | "\u0F18".."\u0F19" | "\u0F35".."\u0F35" | "\u0F37".."\u0F37" | "\u0F39".."\u0F39" | "\u0F71".."\u0F7E" | "\u0F80".."\u0F84" | "\u0F86".."\u0F87" | "\u0F90".."\u0F95" | "\u0F97".."\u0F97" | "\u0F99".."\u0FAD" | "\u0FB1".."\u0FB7" | "\u0FB9".."\u0FB9" | "\u20D0".."\u20DC" | "\u20E1".."\u20E1" | "\u302A".."\u302F" | "\u3099".."\u309A" | "\uFB1E".."\uFB1E" | "\uFE20".."\uFE23"

    unicodeConnectorPunctuation = "\u005F" | "\u203F".."\u2040" | "\u30FB" | "\uFE33".."\uFE34" | "\uFE4D".."\uFE4F" | "\uFF3F" | "\uFF65"
    unicodeSpaceSeparator = "\u2000".."\u200B" | "\u3000"

    // Override Ohm's built-in definition of space.
    space := whitespace | lineTerminator | comment

    whitespace = "\\t"
               | "\x0B"    -- verticalTab
               | "\x0C"    -- formFeed
               | " "
               | "\u00A0"  -- noBreakSpace
               | "\uFEFF"  -- byteOrderMark
               | unicodeSpaceSeparator

    lineTerminator = "\\n" | "\\r" | "\u2028" | "\u2029"
    lineTerminatorSequence = "\\n" | "\\r" ~"\\n" | "\u2028" | "\u2029" | "\\r\\n"

    comment = multiLineComment | singleLineComment

    multiLineComment = "/*" (~"*/" any)* "*/"
    singleLineComment = ("//" | "#") (~lineTerminator any)*
    
    string = "\\"" stringCharacter* "\\""
    stringCharacter = ~("\\"" | "\\\\" | lineTerminator) any -- nonEscaped
                    | "\\\\" singleEscapeCharacter          -- escaped
    singleEscapeCharacter = "\\"" | "\\\\"
}
`);

export const semantic = grammar.createSemantics();

semantic.addOperation("parse", {
    _terminal(){
        return this.sourceString;
    },
    Program(imports, declarations){
        return {imports: imports.children.map(part => part.parse()), declarations: declarations.children.map(part => part.parse())};
    },
    ImportTemplates(_, _1, _2, _3, _4, _5, path, _7){
        return {importType: "template", path: path.parse()};
    },
    Template(name, _2, args, _3, _4){
        return {type: "template", name: name.parse(), args: args.parse(), context: TemplateContext.OuterDeclaration};
    },
    InnerTemplate(name, _2, args, _3, _4){
        return {type: "template", name: name.parse(), args: args.parse(), context: TemplateContext.InnerDeclaration};
    },
    // TODO: Allow other templates to do this.
    DefineTemplate(_, _2, name, _3, arg, _4, _5){
        return {type: "template", name: "define", args: [name.parse(), arg.parse()], context: TemplateContext.OuterDeclaration};
    },
    InnerDefineTemplate(_, _2, name, _3, arg, _4, _5){
        return {type: "template", name: "define", args: [name.parse(), arg.parse()], context: TemplateContext.InnerDeclaration};
    },
    PrimaryExpression_template(name, _2, args, _3){
        return {type: "template", name: name.parse(), args: args.parse(), context: TemplateContext.Expression};
    },
    ExportOuterConstDeclaration(_1, _2, _3, _4, name, _6, expr, _8){
        return {type: "const", modifier: "export", name: name.parse(), expr: expr.parse()};
    },
    InlineOuterConstDeclaration(_1, _2, _3, _4, name, _6, expr, _8){
        return {type: "const", modifier: "inline", name: name.parse(), expr: expr.parse()};
    },
    ExportFunctionDeclaration(_1, _2, _3, _4, name, _6, args, _8, block){
        return {type: "function", modifier: "export", name: name.parse(), args: args.parse(), block: block.parse()};
    },
    InlineFunctionDeclaration(_1, _2, _3, _4, name, _6, args, _8, block){
        return {type: "function", modifier: "inline", name: name.parse(), args: args.parse(), block: block.parse()};
    },
    InlinePolyfillFunctionDeclaration(_1, _2, _3, _4, _5, _6, name, _7, args, _8, block){
        return {type: "function", modifier: "inline", polyfill: true, name: name.parse(), args: args.parse(), block: block.parse()};
    },
    ExportDeclaration(_1, _2, name, _3){
        return {type: "export", modifier: "export", name: name.parse()};
    },
    UnnamedActionDeclaration(_1, _2, name, block){
        return {type: "action", modifier: "export", name: name.parse(), funcName: "", block: block.parse()};
    },
    NoArgsActionDeclaration(_1, _2, funcName, _4, name, block){
        return {type: "action", modifier: "export", name: name.parse(), funcName: funcName.parse(), block: block.parse()};
    },
    ArgsActionDeclaration(_1, _2, funcName, _4, args, _5, _6, name, block){
        return {type: "action", modifier: "export", name: name.parse(), funcName: funcName.parse(), args: args.parse(), block: block.parse()};
    },
    NoArgsActionsDeclaration(_1, _2, name, _4, args, _6){
        return {type: "actions", modifier: "export", name: name.parse(), args: args.parse()};
    },
    ArgsActionsDeclaration(_1, _2, name, _4, actionArgs, _5, _6, args, _7){
        return {type: "actions", modifier: "export", name: name.parse(), args: args.parse(), actionArgs: actionArgs.parse()};
    },
    ExpressionDeclaration(_1, block) {
        return {type: "expression", modifier: "export", block: block.parse()};
    },
    GraphDeclaration(_1, p1, op, p2, _2){
        return {type: "graph", modifier: "export", p1: p1.parse(), p2: p2.parse(), op: op.parse()};
    },
    PointDeclaration(_1, point, _2){
        return {type: "point", modifier: "export", point: point.parse()};
    },
    PolygonDeclaration(_1, _2, points, _3, _4){
        return {type: "polygon", modifier: "export", points: points.asIteration().parse()};
    },
    DisplayDeclaration(_1, type, _2, value, _3){
        return {type: "display", modifier: "export", displayType: type.parse(), value: value.parse()};
    },
    ParsedActionArgs(name, _1, args, _2){
        return {type: "aargs", name: name.parse(), args: args.asIteration().parse()};
    },
    parsedTemplateString(_1, string, _2){
        return {type: "template", name: "parse", args: [{type: "template", name: "concat", args: string.parse(), context: TemplateContext.Expression}], context: TemplateContext.Expression}
    },
    parsedTemplateStringTemplate(_, expr, _2){
        return {expression: true, value: expr.parse(), source: expr.sourceString};
    },
    embeddedTemplateString(_1, string, _2){
        return {type: "template", name: "concat", args: string.parse(), context: TemplateContext.Expression};
    },
    embeddedTemplateStringTemplate(_, expr, _2){
        return {type: "template", name: "wrap", args: [{expression: true, value: expr.parse(), source: expr.sourceString, nonStrict: true}], context: TemplateContext.Expression};
    },
    parsedExportIdentifier(id){
        return {type: "template", name: "parse", args: [id.parse()], context: TemplateContext.Expression};
    },
    Point(_1, p1, _2, p2, _3){
        return [p1.parse(), p2.parse()];
    },
    Array(_1, arr, _2){
        return arr.asIteration().parse();
    },
    ExportFunctionArgs(l){
        return l.asIteration().parse();
    },
    FunctionArgs(l){
        return l.asIteration().parse();
    },
    TemplateArgs(l){
        return l.asIteration().parse();
    },
    FunctionBody_block(block){
        return block.parse();
    },
    FunctionBody_arrow(_1, expression, _2){
        return [{type: "var", name: "state", expr: expression.parse()}];
    },
    ActionName(name, _1, args, _2){
        const arr = [name.parse()];
        if(args) {
            //For some reason the args are in a double array, with the first element being the args array.
            const parsed = args.parse()[0];
            if(parsed) arr.push(...parsed);
        }

        return arr;
    },
    ActionsArgs(l){
        return l.asIteration().parse();
    },
    templateString(_1, string, _2){
        return {type: "template", name: "concat", args: string.parse(), context: TemplateContext.Expression};
    },
    templateStringTemplate(_, expr, _2){
        return {expression: true, value: expr.parse(), source: expr.sourceString};
    },
    identifier(_){
        return this.sourceString;
    },
    identifierName(_, _2){
        return this.sourceString;
    },
    exportIdentifier(_, _2, _3){
        return this.sourceString;
    },
    templateName(name, _){
        return name.parse();
    },
    TemplateArg_string(str) {
        return str.parse();
    },
    TemplateArg_boolean(_) {
        return this.sourceString === "true";
    },
    TemplateArg_null(_) {
        return null;
    },
    TemplateArg_block(_, block, _2) {
        return {block: true, value: block.sourceString};
    },
    TemplateArg_expression(expr) {
        return {expression: true, value: expr.parse(), source: expr.sourceString};
    },
    Expression(e){
        return e.parse();
    },
    PrimaryExpression_paren(_, e, _2){
        return e.parse();
    },
    PrimaryExpression_if(e){
        return {type: "b", args: [[e.parse()]]};
    },
    PrimaryExpression_log(_, e1, _1, e2, _2){
        return {type: "f", args: ["log_base", [e1.parse(), e2.parse()]]};
    },
    PrimaryExpression_func(n, _, l, _2){
        return {type: "f", args: [n.parse(), l.asIteration().parse()]}
    },
    PrimaryExpression_var(e){
        return {type: "v", args: [e.parse()]};
    },
    PrimaryExpression_point(e){
        return {type: "f", args: ["point", e.parse()]};
    },
    PrimaryExpression_array(e){
        return {type: "f", args: ["array", e.parse()]};
    },
    PrimaryExpression_block(e){
        return {type: "b", args: [e.parse()]};
    },
    MemberExpression_arrayIdx(e, _, e1, _2){
        return {type: "f", args: ["array_idx", [e.parse(), e1.parse()]]};
    },
    MemberExpression_pointIdx(e, _, e1){
        return {type: "f", args: ["point_" + e1.parse(), [e.parse()]]};
    },
    MemberExpression_arrayLength(e, _, _2){
        return {type: "f", args: ["array_length", [e.parse()]]};
    },
    MemberExpression_filter(e, _, _2, _3, varName, _4, block, _5){
        return {type: "a_f", args: [e.parse(), varName.parse(), block.parse()]};
    },
    MemberExpression_map(e, _, _2, _3, varName, _4, block, _5){
        return {type: "a_m", args: [e.parse(), varName.parse(), block.parse()]};
    },
    UnaryExpression_plus(_, e){
        return e.parse();
    },
    UnaryExpression_neg(_, e){
        return {type: "n", args: [e.parse()]};
    },
    UnaryExpression_not(_, e){
        return {type: "f", args: ["not", [e.parse()]]};
    },
    ExponentialExpression_exp(e, _, e2){
        return {type: "^", args: [e.parse(), e2.parse()]};
    },
    MultiplicativeExpression_mul(e, _, e2){
        return {type: "*", args: [e.parse(), e2.parse()]};
    },
    MultiplicativeExpression_div(e, _, e2){
        return {type: "/", args: [e.parse(), e2.parse()]};
    },
    MultiplicativeExpression_mod(e, _, e2){
        return {type: "f", args: ["mod", [e.parse(), e2.parse()]]};
    },
    AdditiveExpression_add(e, _, e2){
        return {type: "+", args: [e.parse(), e2.parse()]};
    },
    AdditiveExpression_sub(e, _, e2){
        return {type: "-", args: [e.parse(), e2.parse()]};
    },
    RelationalExpression_lt(e, _, e2){
        return {type: "f", args: ["lt", [e.parse(), e2.parse()]]};
    },
    RelationalExpression_gt(e, _, e2){
        return {type: "f", args: ["gt", [e.parse(), e2.parse()]]};
    },
    RelationalExpression_lte(e, _, e2){
        return {type: "f", args: ["lte", [e.parse(), e2.parse()]]};
    },
    RelationalExpression_gte(e, _, e2){
        return {type: "f", args: ["gte", [e.parse(), e2.parse()]]};
    },
    EqualityExpression_equal(e, _, e2){
        return {type: "f", args: ["equal", [e.parse(), e2.parse()]]};
    },
    EqualityExpression_notEqual(e, _, e2){
        return {type: "f", args: ["notEqual", [e.parse(), e2.parse()]]};
    },
    AndExpression_and(e, _, e2){
        return {type: "f", args: ["and", [e.parse(), e2.parse()]]};
    },
    OrExpression_or(e, _, e2){
        return {type: "f", args: ["or", [e.parse(), e2.parse()]]};
    },
    booleanLiteral(_) {
        return this.sourceString === "true" ? 1 : 0;
    },
    decimalLiteral_bothParts(_, _2, _3){
        return this.sourceString;
    },
    decimalLiteral_decimalsOnly(_, _2){
        return this.sourceString;
    },
    decimalLiteral_integerOnly(_){
        return this.sourceString;
    },
    decimalIntegerLiteral_nonZero(_, _1){
        return this.sourceString;
    },
    decimalIntegerLiteral_zero(_){
        return this.sourceString;
    },
    ExpressionBlock(_, e, _2){
        return e.parse();
    },
    Block(_, e, _2){
        return e.parse();
    },
    InnerDeclarations_inner(items, setState){
        const parsedItems = items.children.map(part => part.parse());

        // Add the implicit set state to the end, if it exists.
        parsedItems.push(...setState.parse());

        return parsedItems;
    },
    InnerDeclarations_state(setState){
        return [setState.parse()];
    },
    ConstDeclaration(_, _2, id, _3, expr, _4){
        return {type: "const", name: id.parse(), expr: expr.parse()};
    },
    LetDeclaration(_, _2, id, _3, expr, _4){
        return {type: "let", name: id.parse(), expr: expr.parse()};
    },
    LetDeclarationEmpty(_, _2, id, _3){
        return {type: "let", name: id.parse(), expr: null};
    },
    SetStateImplicit(expr){
        return {type: "var", name: "state", expr: expr.parse()};
    },
    SetVar(id, _2, expr, _3){
        return {type: "var", name: id.parse(), expr: expr.parse()};
    },
    StateBlock_block(block){
        return block.parse();
    },
    IfStatement(_, _2, condition, _3, ifaction, _4, elseaction){
        let elseAction = elseaction.parse();
        if(!Array.isArray(elseAction)) elseAction = [elseAction];
        if(Array.isArray(elseAction[0])) elseAction = elseAction[0];
        if(elseAction.length < 1) elseAction = null;

        return {type: "if", condition: condition.parse(), ifaction: ifaction.parse(), elseaction: elseAction};
    },
    Ternary(condition, _1, tRes, _2, fRes){
        return {type: "b", args: [[{type: "if", condition: condition.parse(), ifaction: [{type: "var", name: "state", expr: tRes.parse()}], elseaction: [{type: "var", name: "state", expr: fRes.parse()}]}]]};
    },
    Sum(_, _2, v, _3, expr1, _4, expr2, _6, action){
        return {type: "sum", args: [v.parse(), expr1.parse(), expr2.parse(), action.parse()]};
    },
    Prod(_, _2, v, _3, expr1, _4, expr2, _6, action){
        return {type: "prod", args: [v.parse(), expr1.parse(), expr2.parse(), action.parse()]};
    },
    Integral(_, _2, v, _3, from, _4, to, _5, action){
        return {type: "int", args: [v.parse(), from.parse(), to.parse(), action.parse()]};
    },
    Derivative(_, _2, v, _3, action){
        return {type: "div", args: [v.parse(), action.parse()]};
    },
    string(_, str, _3){
        return str.parse().join("");
    },
    stringCharacter_nonEscaped(str){
        return str.parse();
    },
    stringCharacter_escaped(_, str){
        return str.parse();
    },
    _iter(...children) {
        return children.map(c => c.parse());
    }
});

export interface ParserOutput {
    imports: Import[],
    declarations: OuterDeclaration[]
}
export interface Import {
    importType: string;
    path: string;
}
export type OuterDeclaration = Template | OuterConstDeclaration | OuterFunctionDeclaration | ExportDeclaration | ActionDeclaration | ActionsDeclaration | ExpressionDeclaration | GraphDeclaration | PointDeclaration | PolygonDeclaration | DisplayDeclaration;

export type InternalTemplateArg = string | number | boolean | TemplateBlock | TemplateDeclareValue | TemplateExpression;
export interface TemplateDeclareValue {
    var: true;
    value: string;
}
export interface TemplateExpression {
    expression: true;
    value: Expression;
    source: string;
    nonStrict?: boolean;
}
export interface Template {
    type: "template" | "templatefunction";
    modifier: undefined;
    name: string;
    args: InternalTemplateArg[];
    context: TemplateContext;
}

export interface OuterConstDeclaration {
    type: "const";
    modifier: Modifier;
    name: string;
    expr: Expression;
}
export interface OuterFunctionDeclaration {
    type: "function";
    modifier: Modifier;
    polyfill?: true;
    name: string;
    args: string[];
    block: Statement[];
}
export interface ExportDeclaration {
    type: "export";
    modifier: "export";
    name: string;
}
export interface ActionDeclaration {
    type: "action";
    modifier: Modifier;
    name: string;
    funcName: string;
    args: string[];
    block: Statement[];
}
export interface ActionsDeclaration {
    type: "actions";
    modifier: Modifier;
    name: string;
    args: string[][];
    actionArgs: string[];
}
export interface ExpressionDeclaration {
    type: "expression";
    modifier: Modifier;
    block: Statement[];
}
export interface GraphDeclaration {
    type: "graph";
    modifier: Modifier;
    p1: Expression;
    p2: Expression;
    op: string;
}
export interface PointDeclaration {
    type: "point";
    modifier: Modifier;
    point: Expression;
}
export interface PolygonDeclaration {
    type: "polygon";
    modifier: Modifier;
    points: Expression[];
}
export interface DisplayDeclaration {
    type: "display";
    modifier: Modifier;
    displayType: "color" | "stroke" | "thickness" | "fill" | "click" | "label" | "drag" | "hidden" | "outline" | "angle" | "size" | "min" | "max" | "step";
    value: string | Expression | TemplateString | ParsedActionArgs;
}
export interface TemplateString {
    type: "tstring";
    args: (string | Expression)[];
}
export interface ParsedActionArgs {
    type: "aargs";
    name: string;
    args: (string | Expression)[];
}
export interface Expression {
    type: "f" | "^" | "*" | "/" | "+" | "-" | "n" | "a_m" | "a_f" | "b" | "v" | "sum" | "prod" | "int" | "div";
    args: (string | object)[];
}
export type Statement = ConstDeclaration | LetDeclaration | Template | SetVar | IfStatement;
export interface ConstDeclaration {
    type: "const";
    name: string;
    expr: Expression;
}
export interface LetDeclaration {
    type: "let";
    name: string;
    expr: Expression;
}
export interface SetVar {
    type: "var";
    name: string;
    expr: Expression;
}
export interface IfStatement {
    type: "if";
    condition: Expression;
    ifaction: Statement[];
    elseaction: Statement[];
}

export type Modifier = "export" | "inline";
