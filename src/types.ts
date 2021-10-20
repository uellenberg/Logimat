export type TemplateArgs = (string | number | boolean)[];
export type TemplateFunction = (args: TemplateArgs, state: TemplateState, context: TemplateContext) => string;

export interface TemplateState {}

export enum TemplateContext {
    OuterDeclaration,
    InnerDeclaration,
    Expression
}

export interface TemplatesObject {
    [key: string]: TemplateObject;
}
export interface TemplateObject {
    function: TemplateFunction;
}