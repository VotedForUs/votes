/**
 * ts-to-zod configuration.
 *
 * @type {import("ts-to-zod").TsToZodConfig}
 */
export default 
    { "name": "typeser", 
        "input": "./dist/index.d.ts", 
        // "output": "../site/src/types.zod.ts" 
        "output": "./dist/types.zod.ts" 
    }
    // { "name": "typeser", 
    //     "input": "./src/api-congress-gov/abstract-api.types.ts", 
    //     "output": "./dist/types.zod.ts" 
    // }
