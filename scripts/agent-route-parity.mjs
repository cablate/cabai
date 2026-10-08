const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function collectRequireAgentMethods(routes) {
  const methods = new Set();

  for (const { apiPath, source } of routes) {
    if (!/\brequireAgent\s*\(/.test(source)) continue;

    for (const method of HTTP_METHODS) {
      const exportPattern = new RegExp(`export\\s+(?:async\\s+function|function|const)\\s+${method}\\b`);
      if (exportPattern.test(source)) methods.add(`${method} ${apiPath}`);
    }
  }

  return methods;
}

export function compareRouteParity(implementedMethods, documentedMethods) {
  return {
    undocumented: [...implementedMethods]
      .filter((entry) => !documentedMethods.has(entry))
      .sort(),
    stale: [...documentedMethods]
      .filter((entry) => !implementedMethods.has(entry))
      .sort(),
  };
}
