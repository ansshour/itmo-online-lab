import katex from 'katex';

export class ApplicationLatex {
  private readonly inlineCache: Map<string, string>;

  public constructor() {
    this.inlineCache = new Map();
  }

  public inline(expression: string): string {
    const cached = this.inlineCache.get(expression);

    if (cached) {
      return cached;
    }

    const rendered = katex.renderToString(expression, {
      displayMode: false,
      output: 'html',
      strict: 'ignore',
      throwOnError: false,
    });

    this.inlineCache.set(expression, rendered);

    return rendered;
  }
}
