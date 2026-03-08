/**
 * CLI command for processing TypeScript declaration files
 * Removes declare module statements and imports to create a flat types file
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

export interface ProcessTypesOptions {
  input?: string;
  output?: string;
}

export interface FsModule {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, data: string, encoding: BufferEncoding) => void;
}

/**
 * Processes a TypeScript declaration file to remove declare module statements and imports
 * @param inputPath Path to the input .d.ts file
 * @param outputPath Path to write the processed .d.ts file
 * @param fs Optional filesystem module for dependency injection (defaults to Node's fs)
 */
export function processTypesFile(
  inputPath: string, 
  outputPath: string,
  fs: FsModule = { readFileSync, writeFileSync }
): void {
  // Read the generated file
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n');
  
  let processedLines: string[] = [];
  let insideDeclareModule = false;
  let moduleDepth = 0;
  let skipRestOfFile = false;
  let inModuleHeaderComment = false;
  let moduleHeaderCommentBuffer: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check if this is the final "types" module that just re-exports everything
    if (trimmedLine.startsWith('declare module "types"')) {
      // Skip the rest of the file (this module and its closing brace)
      skipRestOfFile = true;
      continue;
    }
    
    if (skipRestOfFile) {
      continue;
    }
    
    // Check if this line starts a declare module block
    if (trimmedLine.startsWith('declare module')) {
      insideDeclareModule = true;
      moduleDepth = 0;
      inModuleHeaderComment = false;
      moduleHeaderCommentBuffer = [];
      continue; // Skip the declare module line itself
    }
    
    // If we're inside a declare module, track braces to find the closing one
    if (insideDeclareModule) {
      // Track if we're in a comment block at the start of the module
      if (!inModuleHeaderComment && moduleHeaderCommentBuffer.length === 0 && trimmedLine.startsWith('/**')) {
        inModuleHeaderComment = true;
        moduleHeaderCommentBuffer.push(line);
        continue;
      }
      
      if (inModuleHeaderComment) {
        moduleHeaderCommentBuffer.push(line);
        if (trimmedLine.endsWith('*/')) {
          inModuleHeaderComment = false;
          // Don't add the comment buffer to processed lines yet - wait to see what comes next
        }
        continue;
      }
      
      // Skip import statements and export type { } statements (all variants)
      // This includes re-exports with 'from' clause and standalone type re-exports
      if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('export type {')) {
        // If we skipped imports, also discard any header comment buffer we collected
        moduleHeaderCommentBuffer = [];
        continue;
      }
      
      // If we reach actual content (not empty line), flush the header comment buffer if we had one
      if (trimmedLine && moduleHeaderCommentBuffer.length > 0) {
        // Only flush if this is actual export content, not just another comment
        if (!trimmedLine.startsWith('/**') && !trimmedLine.startsWith('*') && !trimmedLine.startsWith('*/')) {
          for (const bufferedLine of moduleHeaderCommentBuffer) {
            const dedentedBuffered = bufferedLine.replace(/^    /, '');
            processedLines.push(dedentedBuffered);
          }
          moduleHeaderCommentBuffer = [];
        }
      }
      
      // Count opening braces
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      
      moduleDepth += openBraces - closeBraces;
      
      // If we've closed the module (depth goes to -1 because we started at 0 and hit the closing brace)
      if (moduleDepth < 0 && trimmedLine === '}') {
        insideDeclareModule = false;
        moduleDepth = 0;
        moduleHeaderCommentBuffer = [];
        continue; // Skip the closing brace of the declare module
      }
      
      // Remove leading 4-space indentation from module content and keep the line
      const dedentedLine = line.replace(/^    /, '');
      processedLines.push(dedentedLine);
    }
  }
  
  // Join the lines and ensure proper formatting
  let processedContent = processedLines.join('\n');
  
  // Remove any leading empty lines
  processedContent = processedContent.replace(/^\s*\n/, '');
  
  // Ensure file ends with exactly two newlines
  processedContent = processedContent.trim() + '\n\n';
  
  // Write the processed content
  fs.writeFileSync(outputPath, processedContent, 'utf-8');
}

/**
 * CLI handler for the types command
 * @param options Options from commander
 * @param fs Optional fs module for testing (defaults to Node fs)
 */
export async function processTypes(
  options: ProcessTypesOptions = {},
  fs: FsModule = { readFileSync, writeFileSync }
): Promise<void> {
  const inputPath = resolve(options.input || './dist/index.d.ts');
  const outputPath = resolve(options.output || './dist/index.d.ts');
  
  try {
    processTypesFile(inputPath, outputPath, fs);
    console.log('✓ Successfully processed types file');
    console.log(`  Input:  ${inputPath}`);
    console.log(`  Output: ${outputPath}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to process types file: ${error.message}`);
    }
    throw error;
  }
}

