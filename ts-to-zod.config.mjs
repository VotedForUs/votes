/**
 * ts-to-zod configuration.
 *
 * @type {import("ts-to-zod").TsToZodConfig}
 */
export default 
    { "name": "typeser", 
        "input": "./dist/types.bundle.d.ts", 
        // "output": "../site/src/types.zod.ts" 
        "output": "./dist/types.zod.ts",
        // BillType is derived via `typeof BILL_TYPES[number]` which ts-to-zod
        // can't validate at compile time; the generated schema is correct at runtime.
        "skipValidation": true
    }
    // { "name": "typeser", 
    //     "input": "./src/api-congress-gov/abstract-api.types.ts", 
    //     "output": "./dist/types.zod.ts" 
    // }
