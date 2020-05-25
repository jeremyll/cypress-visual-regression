const fs = require('fs');
const path = require('path');

const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const sanitize = require('sanitize-filename');

const { adjustCanvas, createFolder, parseImage } = require('./utils');

let SNAPSHOT_ACTUAL_DIRECTORY;
let SNAPSHOT_BASE_DIRECTORY;
let SNAPSHOT_DIFF_DIRECTORY;
let CYPRESS_SCREENSHOT_DIR;

function setupScreenshotPath(config) {
  // use cypress default path as fallback
  CYPRESS_SCREENSHOT_DIR =
    (config || {}).screenshotsFolder || 'cypress/screenshots';
}

function setupSnapshotPaths(args) {
  SNAPSHOT_BASE_DIRECTORY =
    args.baseDir || path.join(process.cwd(), 'cypress', 'snapshots', 'base');

  SNAPSHOT_ACTUAL_DIRECTORY =
    path.join(process.cwd(), 'cypress', 'snapshots', 'actual');

  SNAPSHOT_DIFF_DIRECTORY =
    args.diffDir || path.join(process.cwd(), 'cypress', 'snapshots', 'diff');
}

function visualRegressionCopy(args) {
  setupSnapshotPaths(args);
  const baseDir = path.join(SNAPSHOT_BASE_DIRECTORY, args.specName);
  const from = path.join(
    SNAPSHOT_ACTUAL_DIRECTORY,
    args.specName,
    `${args.from}.png`
  );
  const to = path.join(baseDir, `${args.to}.png`);

  return createFolder(baseDir, false).then(() => {
    fs.copyFileSync(from, to);
    return true;
  });
}

async function compareSnapshotsPlugin(args) {
  setupSnapshotPaths(args);

  const fileName = sanitize(args.fileName);

  const options = {
    actualImage: path.join(
      SNAPSHOT_ACTUAL_DIRECTORY,
      args.specDirectory,
      `${fileName}.png`
    ),
    expectedImage: path.join(
      SNAPSHOT_BASE_DIRECTORY,
      args.specDirectory,
      `${fileName}.png`
    ),
    diffImage: path.join(
      SNAPSHOT_DIFF_DIRECTORY,
      args.specDirectory,
      `${fileName}.png`
    ),
  };

  let mismatchedPixels = 0;
  let percentage = 0;
  try {
    const specActualFolder = path.join(SNAPSHOT_ACTUAL_DIRECTORY, args.specDirectory);
    await createFolder(specActualFolder, args.failSilently);
    const specFolder = path.join(SNAPSHOT_DIFF_DIRECTORY, args.specDirectory);
    await createFolder(specFolder, args.failSilently);
    const specBaseFolder = path.join(SNAPSHOT_BASE_DIRECTORY, args.specDirectory);
    await createFolder(specBaseFolder, args.failSilently);
    const imgActual = await parseImage(options.actualImage);

    if (!fs.existsSync(options.expectedImage)) {
        // Copy actual to diff if we don't have an expected image
        fs.createReadStream(options.actualImage).pipe(fs.createWriteStream(options.diffImage));
    } else {
        const imgActual = await parseImage(options.actualImage);
        const diff = new PNG({
          width: Math.max(imgActual.width, imgExpected.width),
          height: Math.max(imgActual.height, imgExpected.height),
        });

        const imgActualFullCanvas = adjustCanvas(
          imgActual,
          diff.width,
          diff.height
        );
        const imgExpectedFullCanvas = adjustCanvas(
          imgExpected,
          diff.width,
          diff.height
        );

        mismatchedPixels = pixelmatch(
          imgActualFullCanvas.data,
          imgExpectedFullCanvas.data,
          diff.data,
          diff.width,
          diff.height,
          { threshold: 0.1 }
        );
        percentage = (mismatchedPixels / diff.width / diff.height) ** 0.5;

        // Write diff file only if difference
        if ( percentage > args.errorThreshold ) {
            diff.pack().pipe(fs.createWriteStream(options.diffImage));
        }
    }
  } catch (error) {
    console.log(error.message)
    return { error };
  }
  return {
    mismatchedPixels,
    percentage,
  };
}

function getCompareSnapshotsPlugin(on, config) {
  setupScreenshotPath(config);
  on('task', {
    compareSnapshotsPlugin,
    visualRegressionCopy,
  });
}

module.exports = getCompareSnapshotsPlugin;
