export interface SourceLocation {
  file: string;
  line: number;
  character: number;
}

export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

export interface CallInfo {
  name: string;
  signature?: string;
  location: SourceLocation;
  children?: CallInfo[];
}

export interface SymbolFlow {
  name: string;
  kind: string;
  signature: string;
  documentation?: string;
  parameters: ParameterInfo[];
  returnType: string;
  location: SourceLocation;
  incoming: CallInfo[];
  outgoing: CallInfo[];
}

export interface RelatedTest {
  file: string;
  relativePath: string;
}
