import type { SerializedError, TestError } from '@vitest/utils';
import type { Reporter, TestCase, TestModule, TestSuite, Vitest } from 'vitest/node';

const MAX_ERROR_CHARS = 1500;

/**
 * The default reporter only prints the failure stack after every file has
 * finished. On a long integration run the live footer says a file failed and
 * leaves out the name and the reason. This reporter writes both as soon as
 * the test or suite fails.
 */
export default class FailureReporter implements Reporter {
    private vitest: Vitest | undefined;
    private seen = new Set<string>();

    onInit(vitest: Vitest): void {
        this.vitest = vitest;
    }

    onTestRunStart(): void {
        this.seen.clear();
    }

    onTestCaseResult(test: TestCase): void {
        const result = test.result();
        if (result.state !== 'failed') return;
        this.print(test.module.relativeModuleId, test.fullName, result.errors);
    }

    onTestSuiteResult(suite: TestSuite): void {
        if (suite.state() !== 'failed') return;
        this.print(suite.module.relativeModuleId, suite.fullName, suite.errors());
    }

    onTestModuleEnd(module: TestModule): void {
        if (module.state() !== 'failed') return;
        this.print(module.relativeModuleId, module.relativeModuleId, module.errors());
    }

    private print(
        file: string,
        name: string,
        errors: ReadonlyArray<SerializedError | TestError> | undefined,
    ): void {
        const list = errors?.length ? errors : [];
        if (list.length === 0) return;

        const blocks = list.map((error) => formatError(error));
        const key = `${file}\n${name}\n${blocks.join('\n')}`;
        if (this.seen.has(key)) return;
        this.seen.add(key);

        const lines = ['', `FAIL ${file}`, `  ${name}`];
        for (const block of blocks) {
            for (const line of block.split('\n')) lines.push(`  ${line}`);
        }
        this.vitest?.logger.error(`${lines.join('\n')}\n`);
    }
}

function formatError(error: SerializedError | TestError): string {
    const parts = [error.message || error.stack || error.name || 'Unknown failure'];
    if ('diff' in error && typeof error.diff === 'string' && error.diff.length > 0) {
        parts.push(error.diff);
    }
    const text = parts.join('\n');
    if (text.length <= MAX_ERROR_CHARS) return text;
    return `${text.slice(0, MAX_ERROR_CHARS)}…`;
}
