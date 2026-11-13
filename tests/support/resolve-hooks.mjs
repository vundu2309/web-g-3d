export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const deep =
      /^@babylonjs\/[^/]+\/./.test(specifier) &&
      !/\.(js|mjs|json|wasm)$/.test(specifier);
    if (deep && error?.code === "ERR_MODULE_NOT_FOUND")
      return next(`${specifier}.js`, context);
    // A side-effect import of a folder (`@babylonjs/loaders/glTF`) means its index.
    if (deep && error?.code === "ERR_UNSUPPORTED_DIR_IMPORT")
      return next(`${specifier}/index.js`, context);
    throw error;
  }
}
