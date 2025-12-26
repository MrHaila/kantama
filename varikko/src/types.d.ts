declare module 'mapshaper' {
  interface Mapshaper {
    // Add minimal interface for mapshaper
    runCommands: (commands: string) => void;
  }
  const mapshaper: Mapshaper;
  export = mapshaper;
}
