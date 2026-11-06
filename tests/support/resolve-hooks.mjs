export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      /^@babylonjs\/[^/]+\/./.test(specifier) &&
      !/\.(js|mjs|json|wasm)$/.test(specifier)
    )
      return next(`${specifier}.js`, context);
    throw error;
  }
}
