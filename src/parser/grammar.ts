import ohm from "ohm-js";

export const grammar = ohm.grammar(`
LogiMat {
    Program = OuterDeclaration*
    OuterDeclaration = OuterConstDeclaration | FunctionDeclaration

    OuterConstDeclaration = ExportOuterConstDeclaration | InlineOuterConstDeclaration
    ExportOuterConstDeclaration = "export" #space "const" #space exportIdentifier "=" Expression ";"
    InlineOuterConstDeclaration = "inline" #space "const" #space identifier "=" Expression ";"

    FunctionDeclaration = ExportFunctionDeclaration | InlineFunctionDeclaration
    ExportFunctionDeclaration = "export" #space "function" #space exportIdentifier "(" FunctionArgs ")" Block
    InlineFunctionDeclaration = "inline" #space "function" #space identifier "(" FunctionArgs ")" Block

    FunctionArgs = ListOf<exportIdentifier, ",">
    
    Block = "{" InnerDeclaration+ "}"
    
    InnerDeclaration = ConstDeclaration
                     | SetState
                     | IfStatement

    ConstDeclaration = "const" #space identifier "=" Expression ";"

    SetState = "state" "=" Expression ";"

    IfStatement = "if" "(" Statement ")" Block "else" Block

    Sum = "sum" "(" exportIdentifier "=" Expression ";" exportIdentifier "<" Expression ")" Block

    Statement = And

    And
      = And "&&" Or   -- and
      | Or

    Or
      = Or "||" Operator   -- or
      | Operator

    Operator = NotOperator
             | EqualOperator
             | NotEqualOperator
             | LessThanOperator
             | LessThanEqualOperator
             | GreaterThanOperator
             | GreaterThanEqualOperator
             | "(" Operator ")"   -- paren

    NotOperator = "!" Operator
    EqualOperator = Expression "==" Expression
    NotEqualOperator = Expression "!=" Expression
    LessThanOperator = Expression "<" Expression
    LessThanEqualOperator = Expression ("<=" | "=<") Expression
    GreaterThanOperator = Expression ">" Expression
    GreaterThanEqualOperator = Expression (">=" | "=>") Expression

    Expression = AddExp

    AddExp
      = AddExp "+" MulExp  -- plus
      | AddExp "-" MulExp  -- minus
      | MulExp
    MulExp
      = MulExp "*" ExpExp  -- times
      | MulExp "/" ExpExp  -- divide
      | ExpExp
    ExpExp
      = PriExp "^" ExpExp  -- power
      | PriExp
    PriExp
      = "(" Expression ")"  -- paren
      | "+" PriExp   -- pos
      | "-" PriExp   -- neg
      | Sum
      | identifierName "(" ListOf<Expression, ","> ")"   -- func
      | identifier   -- var
      | number

    number  (a number)
      = digit* "." digit+  -- fract
      | digit+             -- whole

    compileOutputDefinition = "export" | "inline"

    builtIns = "sin"
             | "cos"
             | "tan"
             | "csc"
             | "sec"
             | "cot"
             | "arcsin"
             | "arccos"
             | "arctan"
             | "arccsc"
             | "arcsec"
             | "arccot"
             | "sinh"
             | "cosh"
             | "tanh"
             | "csch"
             | "sech"
             | "coth"
             | "lcm"
             | "gcd"
             | "mod"
             | "floor"
             | "ceil"
             | "round"
             | "abs"
             | "sign"
             | "ln"
             | "log"
             | "sum"

    exportIdentifier = "a".."z"

    reservedWord = "export"
                  | "inline"
                  | "const"
                  | "function"
                  | builtIns
    identifier (an identifier) = ~reservedWord identifierName
    identifierName (an identifier) = letter identifierPart*

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
    singleLineComment = "//" (~lineTerminator any)*
}
`);