export type TemplateArg = string | number | boolean | TemplateBlock;
export type TemplateArgs = TemplateArg[];
export type TemplateReturn = string | ((state: object) => TemplateReturn);
export type TemplateFunction = (args: TemplateArgs, state: TemplateState, context: TemplateContext) => TemplateReturn | Promise<TemplateReturn>;

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

export interface TemplateModule {
    templates: TemplateObject;
    postTemplates?: string;
}

export interface TemplateBlock {
    block: true;
    value: string;
}

export interface LogimatTemplateState {
    logimat: {
        files: string[],
        definitions: Record<string, TemplateArg>
    }
}