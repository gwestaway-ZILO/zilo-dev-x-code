/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

interface TipsProps {
  config: unknown; // Config is passed but not used
}

export const Tips: React.FC<TipsProps> = () => {
  return (
    <Box flexDirection="column">
      <Text color={Colors.Foreground}>Tips for getting started:</Text>
      <Text color={Colors.Foreground}>
        1. Run{' '}
        <Text bold color={Colors.AccentPurple}>
          /init
        </Text>{' '}
        to analyze your project and create a DevX.md file.
      </Text>
      <Text color={Colors.Foreground}>
        2. Ask questions, edit files, or run commands.
      </Text>
      <Text color={Colors.Foreground}>
        3. Be specific for the best results.
      </Text>
      <Text color={Colors.Foreground}>
        4.{' '}
        <Text bold color={Colors.AccentPurple}>
          /help
        </Text>{' '}
        for more information.
      </Text>
    </Box>
  );
};
