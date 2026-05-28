// ─────────────────────────────────────────────────────────────────────────────
//  ThumbnailGenerator.js — Generate thumbnails for asset library
//
//  Uses Electron's nativeImage API to avoid sharp dependency.
//  Falls back to copying the original if resize fails.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const path = require('path');
const fs = require('fs');

class ThumbnailGenerator {
  /**
   * @param {string} thumbnailsDir
   * @param {number} [maxSize=200]
   */
  constructor(thumbnailsDir, maxSize = 200) {
    this._thumbnailsDir = thumbnailsDir;
    this._maxSize = maxSize;
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }
  }

  /**
   * Generate a thumbnail from a source image file
   * @param {string} sourcePath
   * @param {string} outputFileName
   * @returns {Promise<string>} Output file path
   */
  async generate(sourcePath, outputFileName) {
    const outputPath = path.join(this._thumbnailsDir, outputFileName);

    try {
      // Try using Electron's nativeImage
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromPath(sourcePath);

      if (img.isEmpty()) {
        // Fallback: copy original
        fs.copyFileSync(sourcePath, outputPath);
        return outputPath;
      }

      const size = img.getSize();
      const scale = Math.min(this._maxSize / size.width, this._maxSize / size.height, 1);
      const newWidth = Math.round(size.width * scale);
      const newHeight = Math.round(size.height * scale);

      const resized = img.resize({ width: newWidth, height: newHeight, quality: 'good' });
      fs.writeFileSync(outputPath, resized.toPNG());
      return outputPath;
    } catch {
      // Fallback: copy original
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, outputPath);
      }
      return outputPath;
    }
  }

  /**
   * Generate thumbnail from Buffer
   * @param {Buffer} imageBuffer
   * @param {string} outputFileName
   * @returns {string} Output file path
   */
  generateFromBuffer(imageBuffer, outputFileName) {
    const outputPath = path.join(this._thumbnailsDir, outputFileName);

    try {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromBuffer(imageBuffer);

      if (img.isEmpty()) {
        fs.writeFileSync(outputPath, imageBuffer);
        return outputPath;
      }

      const size = img.getSize();
      const scale = Math.min(this._maxSize / size.width, this._maxSize / size.height, 1);
      const newWidth = Math.round(size.width * scale);
      const newHeight = Math.round(size.height * scale);

      const resized = img.resize({ width: newWidth, height: newHeight, quality: 'good' });
      fs.writeFileSync(outputPath, resized.toPNG());
      return outputPath;
    } catch {
      fs.writeFileSync(outputPath, imageBuffer);
      return outputPath;
    }
  }
}

module.exports = ThumbnailGenerator;
