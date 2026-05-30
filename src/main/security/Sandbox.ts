import path from 'path'
import os from 'os'

export class Sandbox {
  private allowedRoots: string[]

  constructor() {
    // Definimos las rutas "sagradas" del workspace (sandboxeado en la carpeta de app)
    // Para simplificar, mapearemos /workspace a una carpeta local dentro del userData o CWD
    const baseDir = path.join(process.cwd(), '.workspace')
    this.allowedRoots = [
      path.join(baseDir, 'docs'),
      path.join(baseDir, 'cache'),
      path.join(baseDir, 'temp'),
    ]
  }

  /**
   * Verifica si una ruta está estrictamente dentro de los límites del sandbox.
   * Evita Path Traversal (e.g. /workspace/docs/../../Windows/System32)
   */
  public isPathAllowed(targetPath: string): boolean {
    const resolvedPath = path.resolve(targetPath)
    
    // Debe empezar con una de las rutas permitidas
    return this.allowedRoots.some(root => {
      const rootResolved = path.resolve(root)
      // Check if resolvedPath starts with rootResolved + path.sep
      // We add path.sep to prevent matching /workspace/docs-fake with /workspace/docs
      return resolvedPath === rootResolved || resolvedPath.startsWith(rootResolved + path.sep)
    })
  }

  public assertAllowed(targetPath: string, origin: string): void {
    if (!this.isPathAllowed(targetPath)) {
      throw new Error(`[SANDBOX VIOLATION] Origen '${origin}' intentó acceder a ruta prohibida: ${targetPath}`)
    }
  }

  public getAllowedRoots(): string[] {
    return [...this.allowedRoots]
  }
}
