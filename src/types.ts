export type TemplateArgs = (string | number | boolean)[];
export type TemplateReturn = string | ((state: object) => TemplateReturn);
export type TemplateFunction = (args: TemplateArgs, state: TemplateState, context: TemplateContext) => TemplateReturn;

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