import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProgressEmitter } from '../../lib/events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock fs before importing the module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock mapshaper
vi.mock('mapshaper', () => ({
  default: {
    runCommands: vi.fn(),
  },
}));

// Import after mocks are set up
import { processMap, generateSVG, processMaps } from '../../lib/maps';
import { exportLayers } from '../../lib/exportLayers';
import fs from 'fs';
import mapshaper from 'mapshaper';

const mockFs = vi.mocked(fs);

describe('maps', () => {
  const testOutputDir = path.join(__dirname, 'test-output');
  const testTopoJsonPath = path.join(testOutputDir, 'test_map.json');
  const testSvgPath = path.join(testOutputDir, 'test_map.svg');

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks - always return true for file existence checks
    mockFs.existsSync.mockImplementation(() => true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.statSync.mockReturnValue({ size: 1024 * 1024 } as fs.Stats); // 1MB
    mockFs.unlinkSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processMap', () => {
    it('should process shapefiles to TopoJSON', async () => {
      const mockEmitter = {
        emitStart: vi.fn(),
        emitProgress: vi.fn(),
        emitComplete: vi.fn(),
        emitError: vi.fn(),
      } as unknown as ProgressEmitter;

      await processMap({
        shapefileDir: testOutputDir,
        outputPath: testTopoJsonPath,
        emitter: mockEmitter,
      });

      // Verify mapshaper was called correctly
      expect(mapshaper.runCommands).toHaveBeenCalledTimes(4); // clip mask + 2 layers + combine

      // Verify progress events
      expect(mockEmitter.emitStart).toHaveBeenCalledWith(
        'process_map',
        4,
        'Processing shapefiles to TopoJSON...'
      );
      expect(mockEmitter.emitProgress).toHaveBeenCalledWith(
        'process_map',
        1,
        4,
        'Creating clipping mask...'
      );
      expect(mockEmitter.emitComplete).toHaveBeenCalledWith(
        'process_map',
        expect.stringContaining('TopoJSON created'),
        expect.objectContaining({
          outputPath: testTopoJsonPath,
          sizeMB: expect.any(String),
        })
      );
    });

    it('should create output directory if it does not exist', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        // Shapefile exists, but output directory doesn't
        return typeof p === 'string' && p.includes('.shp');
      });

      await processMap({
        outputPath: testTopoJsonPath,
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testOutputDir, { recursive: true });
    });

    it('should create clipping mask with correct bbox', async () => {
      await processMap({
        outputPath: testTopoJsonPath,
      });

      const clipMaskCall = (mapshaper.runCommands as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(clipMaskCall).toContain('-rectangle bbox=24.5,60,25.3,60.5');
      expect(clipMaskCall).toContain('-proj init=EPSG:4326');
    });

    it('should reproject each layer to EPSG:4326', async () => {
      await processMap({
        shapefileDir: testOutputDir,
        outputPath: testTopoJsonPath,
      });

      const waterLayerCall = (mapshaper.runCommands as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const roadsLayerCall = (mapshaper.runCommands as ReturnType<typeof vi.fn>).mock.calls[2][0];

      expect(waterLayerCall).toContain('-proj EPSG:4326');
      expect(roadsLayerCall).toContain('-proj EPSG:4326');
    });

    it('should clip each layer to bbox', async () => {
      await processMap({
        outputPath: testTopoJsonPath,
      });

      const waterLayerCall = (mapshaper.runCommands as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(waterLayerCall).toContain('-clip');
      expect(waterLayerCall).toContain('clip_mask.json');
    });

    it('should simplify geometries by 80%', async () => {
      await processMap({
        outputPath: testTopoJsonPath,
      });

      const waterLayerCall = (mapshaper.runCommands as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(waterLayerCall).toContain('-simplify 80% keep-shapes');
    });

    it('should combine layers into single TopoJSON', async () => {
      await processMap({
        outputPath: testTopoJsonPath,
      });

      const combineCall = (mapshaper.runCommands as ReturnType<typeof vi.fn>).mock.calls[3][0];
      expect(combineCall).toContain('combine-files');
      expect(combineCall).toContain('format=topojson');
    });

    it('should cleanup temporary files on success', async () => {
      await processMap({
        outputPath: testTopoJsonPath,
      });

      // Should cleanup: temp_water.json, temp_roads.json, clip_mask.json
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(3);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('temp_water.json'));
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('temp_roads.json'));
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('clip_mask.json'));
    });

    it('should cleanup temporary files on error', async () => {
      const mockEmitter = {
        emitStart: vi.fn(),
        emitProgress: vi.fn(),
        emitComplete: vi.fn(),
        emitError: vi.fn(),
      } as unknown as ProgressEmitter;

      (mapshaper.runCommands as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Mapshaper error')
      );

      await expect(
        processMap({
          outputPath: testTopoJsonPath,
          emitter: mockEmitter,
        })
      ).rejects.toThrow('Mapshaper error');

      expect(mockEmitter.emitError).toHaveBeenCalledWith(
        'process_map',
        expect.any(Error),
        'Failed to process map'
      );

      // Should cleanup temp files even on error
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should throw error if shapefile does not exist', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        // Only the shapefile doesn't exist
        return !(p as string).includes('L4L_VesiAlue.shp');
      });

      await expect(
        processMap({
          shapefileDir: testOutputDir,
          outputPath: testTopoJsonPath,
        })
      ).rejects.toThrow('Shapefile not found');
    });
  });

  describe('generateSVG', () => {
    const mockTopoJson = {
      type: 'Topology',
      objects: {
        water: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Polygon',
              arcs: [[0, 1, 2, 3, -1]],
            },
          ],
        },
        roads: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'LineString',
              arcs: [4, 5, 6],
            },
          ],
        },
      },
      arcs: [
        [
          [24.9, 60.15],
          [24.91, 60.16],
        ],
        [
          [24.91, 60.16],
          [24.92, 60.17],
        ],
        [
          [24.92, 60.17],
          [24.93, 60.18],
        ],
        [
          [24.93, 60.18],
          [24.9, 60.15],
        ],
        [
          [24.8, 60.1],
          [24.85, 60.12],
        ],
        [
          [24.85, 60.12],
          [24.9, 60.14],
        ],
        [
          [24.9, 60.14],
          [24.95, 60.16],
        ],
      ],
    };

    beforeEach(() => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockTopoJson));
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockFs.statSync.mockReturnValue({ size: 50 * 1024 } as fs.Stats); // 50KB
    });

    it('should generate SVG from TopoJSON', async () => {
      const mockEmitter = {
        emitStart: vi.fn(),
        emitProgress: vi.fn(),
        emitComplete: vi.fn(),
        emitError: vi.fn(),
      } as unknown as ProgressEmitter;

      await generateSVG({
        topoJsonPath: testTopoJsonPath,
        outputPath: testSvgPath,
        emitter: mockEmitter,
      });

      // Verify progress events
      expect(mockEmitter.emitStart).toHaveBeenCalledWith(
        'generate_svg',
        3,
        'Generating SVG from TopoJSON...'
      );
      expect(mockEmitter.emitProgress).toHaveBeenCalledWith(
        'generate_svg',
        1,
        3,
        'Loading TopoJSON...'
      );
      expect(mockEmitter.emitComplete).toHaveBeenCalledWith(
        'generate_svg',
        expect.stringContaining('SVG generated'),
        expect.objectContaining({
          outputPath: testSvgPath,
          sizeKB: expect.any(String),
        })
      );

      // Verify SVG was written
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        testSvgPath,
        expect.stringContaining('<svg'),
        'utf-8'
      );
    });

    it('should create output directory if it does not exist', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        // TopoJSON exists, but output dir doesn't
        return (p as string).includes('test_map.json');
      });

      await generateSVG({
        topoJsonPath: testTopoJsonPath,
        outputPath: testSvgPath,
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testOutputDir, { recursive: true });
    });

    it('should include SVG viewBox with correct parameters', async () => {
      await generateSVG({
        topoJsonPath: testTopoJsonPath,
        outputPath: testSvgPath,
      });

      const svgContent = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(svgContent).toContain('<svg viewBox=');
      expect(svgContent).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('should include CSS styles with CSS variables', async () => {
      await generateSVG({
        topoJsonPath: testTopoJsonPath,
        outputPath: testSvgPath,
      });

      const svgContent = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(svgContent).toContain('<style>');
      expect(svgContent).toContain('.background-rect');
      expect(svgContent).toContain('.water-layer');
      expect(svgContent).toContain('.road-layer');
      expect(svgContent).toContain('var(--bg-color');
      expect(svgContent).toContain('var(--water-color');
      expect(svgContent).toContain('var(--road-color');
    });

    it('should render water layer with correct class', async () => {
      await generateSVG({
        topoJsonPath: testTopoJsonPath,
        outputPath: testSvgPath,
      });

      const svgContent = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(svgContent).toContain('<g class="water-layer">');
      expect(svgContent).toContain('<path d=');
      expect(svgContent).toContain('data-index="0"');
    });

    it('should render roads layer with correct class', async () => {
      await generateSVG({
        topoJsonPath: testTopoJsonPath,
        outputPath: testSvgPath,
      });

      const svgContent = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(svgContent).toContain('<g class="road-layer">');
    });

    it('should include background rectangle', async () => {
      await generateSVG({
        topoJsonPath: testTopoJsonPath,
        outputPath: testSvgPath,
      });

      const svgContent = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(svgContent).toContain('<rect class="background-rect"');
    });

    it('should throw error if TopoJSON file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(
        generateSVG({
          topoJsonPath: testTopoJsonPath,
          outputPath: testSvgPath,
        })
      ).rejects.toThrow('TopoJSON file not found');
    });

    it('should emit error on failure', async () => {
      const mockEmitter = {
        emitStart: vi.fn(),
        emitProgress: vi.fn(),
        emitComplete: vi.fn(),
        emitError: vi.fn(),
      } as unknown as ProgressEmitter;

      // File exists, but reading fails
      mockFs.existsSync.mockImplementation((p) => {
        return (p as string).includes('test_map.json');
      });
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      await expect(
        generateSVG({
          topoJsonPath: testTopoJsonPath,
          outputPath: testSvgPath,
          emitter: mockEmitter,
        })
      ).rejects.toThrow('Read error');

      expect(mockEmitter.emitError).toHaveBeenCalledWith(
        'generate_svg',
        expect.any(Error),
        'Failed to generate SVG'
      );
    });
  });

  describe('processMaps', () => {
    const mockTopoJson = {
      type: 'Topology',
      objects: {
        water: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Polygon',
              arcs: [[0, 1, 2, 3, -1]],
            },
          ],
        },
        roads: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'LineString',
              arcs: [4, 5, 6],
            },
          ],
        },
      },
      arcs: [
        [
          [24.9, 60.15],
          [24.91, 60.16],
        ],
        [
          [24.91, 60.16],
          [24.92, 60.17],
        ],
        [
          [24.92, 60.17],
          [24.93, 60.18],
        ],
        [
          [24.93, 60.18],
          [24.9, 60.15],
        ],
        [
          [24.8, 60.1],
          [24.85, 60.12],
        ],
        [
          [24.85, 60.12],
          [24.9, 60.14],
        ],
        [
          [24.9, 60.14],
          [24.95, 60.16],
        ],
      ],
    };

    beforeEach(() => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockTopoJson));
    });

    it('should process map and generate SVG in sequence', async () => {
      const mockEmitter = {
        emitStart: vi.fn(),
        emitProgress: vi.fn(),
        emitComplete: vi.fn(),
        emitError: vi.fn(),
      } as unknown as ProgressEmitter;

      await processMaps({
        shapefileDir: testOutputDir,
        outputPath: testTopoJsonPath,
        emitter: mockEmitter,
      });

      // Both stages should complete
      expect(mockEmitter.emitComplete).toHaveBeenCalledWith(
        'process_map',
        expect.any(String),
        expect.any(Object)
      );
      expect(mockEmitter.emitComplete).toHaveBeenCalledWith(
        'generate_svg',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use correct SVG output path', async () => {
      await processMaps({
        outputPath: testTopoJsonPath,
      });

      // SVG should be written to .svg version of the TopoJSON path
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        testSvgPath,
        expect.any(String),
        'utf-8'
      );
    });

    it('should export layered SVG files', async () => {
      const mockEmitter = {
        emitStart: vi.fn(),
        emitProgress: vi.fn(),
        emitComplete: vi.fn(),
        emitError: vi.fn(),
      } as unknown as ProgressEmitter;

      await processMaps({
        shapefileDir: testOutputDir,
        outputPath: testTopoJsonPath,
        emitter: mockEmitter,
      });

      // Should complete all three stages
      expect(mockEmitter.emitComplete).toHaveBeenCalledWith(
        'process_map',
        expect.any(String),
        expect.any(Object)
      );
      expect(mockEmitter.emitComplete).toHaveBeenCalledWith(
        'generate_svg',
        expect.any(String),
        expect.any(Object)
      );
      expect(mockEmitter.emitComplete).toHaveBeenCalledWith(
        'export_layers',
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('exportLayers', () => {
    const mockTopoJson = {
      type: 'Topology',
      objects: {
        water: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Polygon',
              arcs: [[0, 1, 2, 3, -1]],
            },
          ],
        },
        roads: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'LineString',
              arcs: [4, 5, 6],
            },
          ],
        },
      },
      arcs: [
        [
          [24.9, 60.15],
          [24.91, 60.16],
        ],
        [
          [24.91, 60.16],
          [24.92, 60.17],
        ],
        [
          [24.92, 60.17],
          [24.93, 60.18],
        ],
        [
          [24.93, 60.18],
          [24.9, 60.15],
        ],
        [
          [24.8, 60.1],
          [24.85, 60.12],
        ],
        [
          [24.85, 60.12],
          [24.9, 60.14],
        ],
        [
          [24.9, 60.14],
          [24.95, 60.16],
        ],
      ],
    };

    const testLayersDir = path.join(testOutputDir, 'layers');

    beforeEach(() => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockTopoJson));
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockFs.statSync.mockReturnValue({ size: 25 * 1024 } as fs.Stats); // 25KB
    });

    it('should export separate water and roads SVG files', async () => {
      const mockEmitter = {
        emitStart: vi.fn(),
        emitProgress: vi.fn(),
        emitComplete: vi.fn(),
        emitError: vi.fn(),
      } as unknown as ProgressEmitter;

      await exportLayers({
        topoJsonPath: testTopoJsonPath,
        outputDir: testLayersDir,
        emitter: mockEmitter,
      });

      // Verify progress events
      expect(mockEmitter.emitStart).toHaveBeenCalledWith(
        'export_layers',
        4,
        'Exporting layered SVG files...'
      );
      expect(mockEmitter.emitComplete).toHaveBeenCalledWith(
        'export_layers',
        expect.stringContaining('Layers exported'),
        expect.objectContaining({
          outputDir: testLayersDir,
          waterSizeKB: expect.any(String),
          roadSizeKB: expect.any(String),
        })
      );

      // Verify water.svg was written
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(testLayersDir, 'water.svg'),
        expect.stringContaining('<svg'),
        'utf-8'
      );

      // Verify roads.svg was written
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(testLayersDir, 'roads.svg'),
        expect.stringContaining('<svg'),
        'utf-8'
      );

      // Verify manifest.json was written
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.join(testLayersDir, 'manifest.json'),
        expect.stringContaining('"viewBox"'),
        'utf-8'
      );
    });

    it('should create layers directory if it does not exist', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        // TopoJSON exists, but layers dir doesn't
        return (p as string).includes('test_map.json');
      });

      await exportLayers({
        topoJsonPath: testTopoJsonPath,
        outputDir: testLayersDir,
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testLayersDir, { recursive: true });
    });

    it('should generate water.svg with correct structure', async () => {
      await exportLayers({
        topoJsonPath: testTopoJsonPath,
        outputDir: testLayersDir,
      });

      const waterSvg = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].endsWith('water.svg')
      )?.[1];

      expect(waterSvg).toContain('<svg viewBox=');
      expect(waterSvg).toContain('<g id="water">');
      expect(waterSvg).toContain('<path d=');
      expect(waterSvg).not.toContain('<style>'); // No embedded styles
    });

    it('should generate roads.svg with correct structure', async () => {
      await exportLayers({
        topoJsonPath: testTopoJsonPath,
        outputDir: testLayersDir,
      });

      const roadsSvg = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].endsWith('roads.svg')
      )?.[1];

      expect(roadsSvg).toContain('<svg viewBox=');
      expect(roadsSvg).toContain('<g id="roads">');
      expect(roadsSvg).toContain('<path d=');
      expect(roadsSvg).not.toContain('<style>'); // No embedded styles
    });

    it('should generate manifest.json with correct structure', async () => {
      await exportLayers({
        topoJsonPath: testTopoJsonPath,
        outputDir: testLayersDir,
      });

      const manifest = (mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].endsWith('manifest.json')
      )?.[1];

      const manifestObj = JSON.parse(manifest);

      expect(manifestObj).toHaveProperty('viewBox');
      expect(manifestObj).toHaveProperty('layers');
      expect(manifestObj.layers).toHaveLength(2);
      expect(manifestObj.layers[0]).toMatchObject({
        id: 'water',
        file: 'water.svg',
        description: expect.any(String),
        zIndex: expect.any(Number),
      });
      expect(manifestObj.layers[1]).toMatchObject({
        id: 'roads',
        file: 'roads.svg',
        description: expect.any(String),
        zIndex: expect.any(Number),
      });
    });


    it('should throw error if TopoJSON file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(
        exportLayers({
          topoJsonPath: testTopoJsonPath,
          outputDir: testLayersDir,
        })
      ).rejects.toThrow('TopoJSON file not found');
    });

    it('should throw error if water layer is missing', async () => {
      const incompleteTopoJson = {
        type: 'Topology',
        objects: {
          roads: mockTopoJson.objects.roads,
        },
        arcs: mockTopoJson.arcs,
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(incompleteTopoJson));

      await expect(
        exportLayers({
          topoJsonPath: testTopoJsonPath,
          outputDir: testLayersDir,
        })
      ).rejects.toThrow('Water layer not found in TopoJSON');
    });

    it('should throw error if roads layer is missing', async () => {
      const incompleteTopoJson = {
        type: 'Topology',
        objects: {
          water: mockTopoJson.objects.water,
        },
        arcs: mockTopoJson.arcs,
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(incompleteTopoJson));

      await expect(
        exportLayers({
          topoJsonPath: testTopoJsonPath,
          outputDir: testLayersDir,
        })
      ).rejects.toThrow('Roads layer not found in TopoJSON');
    });

    it('should emit error on failure', async () => {
      const mockEmitter = {
        emitStart: vi.fn(),
        emitProgress: vi.fn(),
        emitComplete: vi.fn(),
        emitError: vi.fn(),
      } as unknown as ProgressEmitter;

      mockFs.existsSync.mockReturnValue(false);

      await expect(
        exportLayers({
          topoJsonPath: testTopoJsonPath,
          outputDir: testLayersDir,
          emitter: mockEmitter,
        })
      ).rejects.toThrow();

      expect(mockEmitter.emitError).toHaveBeenCalledWith(
        'export_layers',
        expect.any(Error),
        'Failed to export layers'
      );
    });
  });
});
