export type {
  LibraryRequest,
  LibraryUsage,
  ApiFunctionSpec,
  ApiParamSpec,
  ApiTypeSpec,
  PerSeedResult,
  PlayerApiSpec,
  RunRequest,
  RunResponse,
  RuntimeFailure,
  WorkerInbound,
  WorkerOutbound,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './protocol.ts';
export { ApiCategory, WORKER_TIMEOUT_MS } from './protocol.ts';

export {
  PLAYER_API,
  apiForWorld,
  apiFunction,
  apiUnlockedAt,
  apiUnlockedBy,
  botHandleDeclaration,
  perBotApi,
  renderParams,
} from './api-spec.ts';

export {
  apiFunctionsFor,
  buildAmbientDts,
  renderSignature,
  requiredTypesFor,
  typeDeclarationFor,
  unlockedApiNames,
} from './ambient.ts';

export type {
  CompileDiagnostic,
  CompileFailure,
  CompileResult,
  CompileSuccess,
  LanguageOptions,
  LibraryCompileResult,
  LibraryCompileSuccess,
  MonacoApi,
} from './compile.ts';
export {
  LIB_FILE_PATH,
  PLAYER_FILE_PATH,
  compileLibrary,
  compilePlayerCode,
  emitOnly,
  configurePlayerLanguage,
  getPlayerDiagnostics,
  setLibraryTypes,
  toAmbientModule,
  toCompileDiagnostics,
} from './compile.ts';

export type { RunnerOptions, WorkerLike } from './host.ts';
export { Runner } from './host.ts';

export type { StackFrame } from './errors.ts';
export { cancelledFailure, parseStackFrames, topFrameLine } from './errors.ts';

export {
  DEFAULT_WRAPPER_OFFSET,
  PLAYER_FRAME_NAME,
  WRAPPER_PREAMBLE_LINES,
  measureWrapperOffset,
  toPlayerLine,
} from './wrapper.ts';

export { decodeLineMap, toSourceLine } from './sourcemap.ts';

export type {
  LibraryModule,
  LinkedProgram,
  LinkOptions,
  LinkScope,
  ModuleLineMaps,
  ModuleLocation,
  ModuleProblem,
  ProgramModule,
  SourceFile,
  StatementSpan,
  TickMeter,
} from './modules.ts';
export {
  LIBRARY_SOURCE_URL,
  LIB_BINDING,
  LIB_SPECIFIER,
  MissingLibraryError,
  ModuleError,
  PROGRAM_SOURCE_URL,
  SOURCE_LABELS,
  findModuleStatements,
  importedLibraryNames,
  importsLibrary,
  linkProgram,
  moduleStack,
  resolveModuleLocation,
  rewriteProgramImports,
  stripLibraryExports,
} from './modules.ts';
