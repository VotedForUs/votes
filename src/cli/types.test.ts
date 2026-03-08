/**
 * Tests for the types CLI command
 */

import mock from "mock-fs";
import fs from "node:fs";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { processTypesFile, processTypes } from "./types.js";
import { wrapFsWithThrow } from "../utils/mocks/wrap-fs-with-throw.js";

const TEST_INPUT = "/test/input.d.ts";
const TEST_OUTPUT = "/test/output.d.ts";

function runProcessTypesFileTest(input: string, assertions: (output: string) => void): void {
  mock({ "/test": { "input.d.ts": input } });
  processTypesFile(TEST_INPUT, TEST_OUTPUT, fs);
  const output = fs.readFileSync(TEST_OUTPUT, "utf-8");
  assertions(output);
}

describe("processTypesFile", () => {
  afterEach(() => {
    mock.restore();
  });

  it("should remove declare module statements", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    export interface TestInterface {
        value: string;
    }
}`,
      (output) => {
        assert.ok(!output.includes("declare module"), "Output should not contain declare module");
        assert.ok(output.includes("export interface TestInterface"), "Output should contain the interface");
        assert.ok(output.includes("value: string"), "Output should contain interface properties");
      }
    );
  });

  it("should remove import statements", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    import { Something } from "other";
    export interface TestInterface {
        value: Something;
    }
}`,
      (output) => {
        assert.ok(!output.includes("import"), "Output should not contain import statements");
        assert.ok(output.includes("export interface TestInterface"), "Output should contain the interface");
      }
    );
  });

  it("should remove export type re-exports with from clause", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    export type { Something } from "other";
    export interface TestInterface {
        value: string;
    }
}`,
      (output) => {
        assert.ok(!output.includes("export type { Something } from"), "Output should not contain re-exports");
        assert.ok(output.includes("export interface TestInterface"), "Output should contain the interface");
      }
    );
  });

  it("should remove module-level indentation", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    export interface TestInterface {
        value: string;
    }
}`,
      (output) => {
        const lines = output.split("\n");
        assert.ok(lines[0].startsWith("export interface"), "First line should not be indented");
        assert.ok(lines[1].startsWith("    value:"), "Property should maintain relative indentation");
      }
    );
  });

  it("should skip final types module with re-exports", () => {
    runProcessTypesFileTest(
      `declare module "test1" {
    export interface TestInterface {
        value: string;
    }
}
declare module "types" {
    export * from "test1";
}`,
      (output) => {
        assert.ok(!output.includes('declare module "types"'), "Output should not contain types module");
        assert.ok(!output.includes("export * from"), "Output should not contain re-exports");
        assert.ok(output.includes("export interface TestInterface"), "Output should contain the interface");
      }
    );
  });

  it("should handle multiple modules", () => {
    runProcessTypesFileTest(
      `declare module "module1" {
    export interface Interface1 {
        value1: string;
    }
}
declare module "module2" {
    export interface Interface2 {
        value2: number;
    }
}`,
      (output) => {
        assert.ok(output.includes("export interface Interface1"), "Output should contain Interface1");
        assert.ok(output.includes("export interface Interface2"), "Output should contain Interface2");
        assert.ok(!output.includes("declare module"), "Output should not contain any declare module statements");
      }
    );
  });

  it("should handle comments and JSDoc", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    /**
     * Test interface with JSDoc
     */
    export interface TestInterface {
        value: string;
    }
}`,
      (output) => {
        assert.ok(output.includes("Test interface with JSDoc"), "Output should preserve JSDoc");
        assert.ok(output.includes("export interface TestInterface"), "Output should contain the interface");
      }
    );
  });

  it("should remove orphaned header comments when imports are removed", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    /**
     * This is a file header comment
     */
    import { Something } from "other";
    export interface TestInterface {
        value: string;
    }
}`,
      (output) => {
        assert.ok(!output.includes("file header comment"), "Output should not contain orphaned header comment");
        assert.ok(output.includes("export interface TestInterface"), "Output should contain the interface");
      }
    );
  });

  it("should handle complex nested structures", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    export interface Parent {
        nested: {
            deeply: {
                value: string;
            };
        };
    }
}`,
      (output) => {
        assert.ok(output.includes("export interface Parent"), "Output should contain Parent interface");
        assert.ok(output.includes("nested:"), "Output should contain nested property");
        assert.ok(output.includes("deeply:"), "Output should contain deeply nested property");
        assert.ok(output.includes("value: string"), "Output should contain inner value");
      }
    );
  });

  it("should handle type aliases and other exports", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    export type StringOrNumber = string | number;
    export enum Status {
        Active = "active",
        Inactive = "inactive"
    }
    export const CONSTANT = "value";
}`,
      (output) => {
        assert.ok(output.includes("export type StringOrNumber"), "Output should contain type alias");
        assert.ok(output.includes("export enum Status"), "Output should contain enum");
        assert.ok(output.includes("export const CONSTANT"), "Output should contain const");
      }
    );
  });

  it("should end file with exactly two newlines", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    export interface TestInterface {
        value: string;
    }
}`,
      (output) => {
        assert.ok(output.endsWith("\n\n"), "Output should end with exactly two newlines");
        assert.ok(!output.endsWith("\n\n\n"), "Output should not end with more than two newlines");
      }
    );
  });

  it("should remove standalone export type re-exports without from clause", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    export interface MemberInfo {
        name: string;
    }
    export interface CommitteeInfo {
        code: string;
    }
    export type { MemberInfo, CommitteeInfo };
}`,
      (output) => {
        assert.ok(!output.includes("export type {"), "Output should not contain export type re-export");
        assert.ok(output.includes("export interface MemberInfo"), "Output should contain MemberInfo interface");
        assert.ok(output.includes("export interface CommitteeInfo"), "Output should contain CommitteeInfo interface");
      }
    );
  });

  it("should remove long multi-type export statements", () => {
    runProcessTypesFileTest(
      `declare module "test" {
    export interface TestInterface {
        value: string;
    }
    export type { MemberInfo, MemberTerm, CommitteeInfo, NominationInfo, HouseRollCallVote, HouseRollCallVoteDetails };
}`,
      (output) => {
        assert.ok(!output.includes("export type {"), "Output should not contain export type statement");
        assert.ok(!output.includes("MemberInfo, MemberTerm"), "Output should not contain type re-exports list");
        assert.ok(output.includes("export interface TestInterface"), "Output should contain the interface");
      }
    );
  });
});

describe("processTypes", () => {
  afterEach(() => {
    mock.restore();
  });

  it("should throw error for non-existent input file", async () => {
    mock({});
    const nonExistent = "/test/does-not-exist.d.ts";

    await assert.rejects(
      async () => {
        await processTypes({ input: nonExistent, output: TEST_OUTPUT });
      },
      /Failed to process types file/,
      "Should throw error for non-existent file"
    );
  });

  it("should handle filesystem errors gracefully", async () => {
    mock({ "/test": { "input.d.ts": "test content" } });
    const wrappedFs = wrapFsWithThrow(fs);
    wrappedFs.setShouldThrowError(true, "Simulated filesystem error");

    await assert.rejects(
      async () => {
        await processTypes({ input: TEST_INPUT, output: TEST_OUTPUT }, wrappedFs);
      },
      /Failed to process types file/,
      "Should throw error with descriptive message"
    );
  });
});
