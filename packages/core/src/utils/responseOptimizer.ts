/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Response optimization utilities to prevent excessive verbosity
 * and improve performance of AI responses
 */

export interface ResponseLimits {
  maxResponseLength: number;
  maxParagraphLength: number;
  maxListItems: number;
  maxDuplicateLines: number;
}

export const DEFAULT_RESPONSE_LIMITS: ResponseLimits = {
  maxResponseLength: 8000, // Reasonable limit for terminal display
  maxParagraphLength: 500, // Prevent wall-of-text paragraphs
  maxListItems: 20, // Limit list length
  maxDuplicateLines: 2, // Prevent excessive repetition
};

/**
 * Optimize response content to prevent excessive verbosity
 */
export function optimizeResponse(content: string, limits: ResponseLimits = DEFAULT_RESPONSE_LIMITS): string {
  if (!content || content.length === 0) {
    return content;
  }

  let optimized = content;

  // 1. Truncate if response is too long
  if (optimized.length > limits.maxResponseLength) {
    const truncatePoint = findSafeTruncationPoint(optimized, limits.maxResponseLength);
    optimized = optimized.substring(0, truncatePoint) + '\n\n[Response truncated for brevity]';
  }

  // 2. Break up long paragraphs
  optimized = breakLongParagraphs(optimized, limits.maxParagraphLength);

  // 3. Limit list items
  optimized = limitListItems(optimized, limits.maxListItems);

  // 4. Remove excessive duplicate lines
  optimized = removeDuplicateLines(optimized, limits.maxDuplicateLines);

  return optimized;
}

/**
 * Find a safe truncation point (end of sentence, paragraph, or list item)
 */
function findSafeTruncationPoint(text: string, maxLength: number): number {
  if (text.length <= maxLength) {
    return text.length;
  }

  // Look for safe truncation points near the limit
  const searchStart = Math.max(0, maxLength - 200);
  const searchText = text.substring(searchStart, maxLength + 100);

  // Try to find end of paragraph first
  const paragraphEnd = searchText.lastIndexOf('\n\n');
  if (paragraphEnd > 0) {
    return searchStart + paragraphEnd;
  }

  // Try to find end of sentence
  const sentenceEnd = searchText.lastIndexOf('. ');
  if (sentenceEnd > 0) {
    return searchStart + sentenceEnd + 1;
  }

  // Try to find end of list item
  const listEnd = searchText.lastIndexOf('\n- ');
  if (listEnd > 0) {
    return searchStart + listEnd;
  }

  // Fallback to word boundary
  const wordEnd = searchText.lastIndexOf(' ');
  if (wordEnd > 0) {
    return searchStart + wordEnd;
  }

  return maxLength;
}

/**
 * Break up paragraphs that are too long
 */
function breakLongParagraphs(text: string, maxLength: number): string {
  return text.replace(/^(.{1,1000}?)(?=\n\n|$)/gm, (paragraph) => {
    if (paragraph.length <= maxLength) {
      return paragraph;
    }

    // Split long paragraph at sentence boundaries
    const sentences = paragraph.split(/\. /);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const addition = (currentChunk ? '. ' : '') + sentence;
      if ((currentChunk + addition).length > maxLength && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk += addition;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.join('.\n\n');
  });
}

/**
 * Limit the number of items in lists
 */
function limitListItems(text: string, maxItems: number): string {
  return text.replace(/(?:^[ ]*[-*+][ ]+.+(?:\n|$))+/gm, (listMatch) => {
    const items = listMatch.trim().split('\n').filter(line => line.trim());
    
    if (items.length <= maxItems) {
      return listMatch;
    }

    const limitedItems = items.slice(0, maxItems);
    const remainingCount = items.length - maxItems;
    limitedItems.push(`... and ${remainingCount} more items`);
    
    return limitedItems.join('\n') + '\n';
  });
}

/**
 * Remove excessive duplicate lines
 */
function removeDuplicateLines(text: string, maxDuplicates: number): string {
  const lines = text.split('\n');
  const result: string[] = [];
  const lineCount = new Map<string, number>();

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === '') {
      result.push(line);
      continue;
    }

    const count = lineCount.get(trimmed) || 0;
    if (count < maxDuplicates) {
      result.push(line);
      lineCount.set(trimmed, count + 1);
    }
  }

  return result.join('\n');
}

/**
 * Detect if response appears to be duplicated
 */
export function detectResponseDuplication(content: string): boolean {
  if (content.length < 200) {
    return false;
  }

  const halfLength = Math.floor(content.length / 2);
  const firstHalf = content.substring(0, halfLength);
  const secondHalf = content.substring(halfLength);

  // Check for exact duplication
  if (firstHalf === secondHalf) {
    return true;
  }

  // Check for near duplication (allowing for minor variations)
  const similarity = calculateSimilarity(firstHalf, secondHalf);
  return similarity > 0.9;
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0 || len2 === 0) {
    return 0;
  }

  // Simple similarity based on common substring length
  let common = 0;
  const minLen = Math.min(len1, len2);
  
  for (let i = 0; i < minLen; i++) {
    if (str1[i] === str2[i]) {
      common++;
    }
  }

  return common / Math.max(len1, len2);
}