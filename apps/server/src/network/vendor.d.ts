declare module 'robots-parser' {
  export default function robotsParser(
    url: string,
    body: string,
  ): {
    isAllowed(url: string, agent?: string): boolean | undefined;
    getCrawlDelay(agent?: string): number | undefined;
  };
}
