// Node's wasm trap handler reserves more address space than a `ulimit -v` cap allows, and Vite
// loads wasm.
export function buildWebBuildEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const nodeOptions = [env['NODE_OPTIONS'], '--disable-wasm-trap-handler'];

  return { ...env, NODE_OPTIONS: nodeOptions.filter(Boolean).join(' ') };
}
