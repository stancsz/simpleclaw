import screenshotDesktop from "screenshot-desktop";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Extension } from "../core/extensions";

const { listDisplays } = screenshotDesktop;

export const plugin: Extension = {
  name: "screencap",
  type: "skill",
  runtimeModes: ["cli", "hybrid", "server"],
  execute: async (args: { 
    action?: string; 
    format?: "png" | "jpeg" | "jpg"; 
    filename?: string;
    display?: number;
    screen?: number;
  }) => {
    const { 
      action = "capture", 
      format = "png", 
      filename,
      display,
      screen 
    } = args;

    try {
      switch (action) {
        case "capture":
        case "screenshot":
          // Create screenshots directory if it doesn't exist
          const screenshotsDir = join(process.cwd(), "screenshots");
          if (!existsSync(screenshotsDir)) {
            mkdirSync(screenshotsDir, { recursive: true });
          }

          // Generate filename if not provided
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const finalFilename = filename || `screenshot-${timestamp}.${format}`;
          const filepath = join(screenshotsDir, finalFilename);

          // Capture screenshot with optional display/screen selection
          const screenshotOptions: { screen?: number; format?: "png" | "jpg" } = {};
          if (display !== undefined) screenshotOptions.screen = display;
          if (screen !== undefined) screenshotOptions.screen = screen;
          if (format === "jpeg" || format === "jpg") {
            screenshotOptions.format = "jpg";
          } else {
            screenshotOptions.format = "png";
          }
          
          const imgBuffer = await screenshotDesktop(screenshotOptions);
          
          // Save to file
          writeFileSync(filepath, imgBuffer);
          
          return {
            success: true,
            message: `Screenshot captured successfully`,
            filepath,
            filename: finalFilename,
            format,
            size: imgBuffer.length,
            timestamp: new Date().toISOString()
          };

        case "list_displays":
        case "displays":
          try {
            const displays = await listDisplays();
            return {
              success: true,
              message: `Found ${displays.length} display(s)`,
              displays: displays.map((display, index) => ({
                id: display.id,
                name: display.name,
                index,
                isPrimary: index === 0
              })),
              count: displays.length,
              platform: process.platform
            };
          } catch (error: any) {
            console.error(`❌ Failed to list displays:`, error.message);
            return {
              success: false,
              message: `Failed to list displays: ${error.message}`,
              error: error.message,
              platform: process.platform
            };
          }

        case "capture_all":
        case "all_screens":
          try {
            const screenshotsDir = join(process.cwd(), "screenshots");
            if (!existsSync(screenshotsDir)) {
              mkdirSync(screenshotsDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const screenshotOptions: { format?: "png" | "jpg" } = {};
            if (format === "jpeg" || format === "jpg") {
              screenshotOptions.format = "jpg";
            } else {
              screenshotOptions.format = "png";
            }

            // Capture all displays
            const allBuffers = await screenshotDesktop.all();
            const results = [];

            for (let i = 0; i < allBuffers.length; i++) {
              const buffer = allBuffers[i];
              if (!buffer) continue;
              
              const displayFilename = filename 
                ? `${filename.replace(/\.[^/.]+$/, "")}-display${i}.${format}`
                : `screenshot-all-display${i}-${timestamp}.${format}`;
              const filepath = join(screenshotsDir, displayFilename);
              
              writeFileSync(filepath, buffer);
              
              results.push({
                displayIndex: i,
                filepath,
                filename: displayFilename,
                format,
                size: buffer.length
              });
            }

            return {
              success: true,
              message: `Captured ${results.length} display(s)`,
              results,
              count: results.length,
              timestamp: new Date().toISOString()
            };
          } catch (error: any) {
            console.error(`❌ Failed to capture all displays:`, error.message);
            return {
              success: false,
              message: `Failed to capture all displays: ${error.message}`,
              error: error.message
            };
          }

        default:
          return {
            success: false,
            message: `Unknown action: ${action}. Available actions: capture, screenshot, list_displays, displays, capture_all, all_screens`
          };
      }
    } catch (error: any) {
      console.error(`❌ Screen capture error:`, error.message);
      return {
        success: false,
        message: `Screen capture failed: ${error.message}`,
        error: error.message
      };
    }
  },
};