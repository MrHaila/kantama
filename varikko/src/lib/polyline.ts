/**
 * Google Encoded Polyline utilities
 * Based on: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

/**
 * Decode Google Encoded Polyline format used by OTP
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    // Decode longitude
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += dlon;

    // OTP uses precision of 5 decimal places
    points.push([lat / 1e5, lon / 1e5]);
  }

  return points;
}

/**
 * Encode coordinates to Google Encoded Polyline format
 */
export function encodePolyline(points: [number, number][]): string {
  let encoded = '';
  let prevLat = 0;
  let prevLon = 0;

  for (const [lat, lon] of points) {
    // Convert to integer (5 decimal precision)
    const iLat = Math.round(lat * 1e5);
    const iLon = Math.round(lon * 1e5);

    // Calculate deltas
    const dLat = iLat - prevLat;
    const dLon = iLon - prevLon;

    // Encode latitude delta
    encoded += encodeValue(dLat);
    // Encode longitude delta
    encoded += encodeValue(dLon);

    prevLat = iLat;
    prevLon = iLon;
  }

  return encoded;
}

/**
 * Encode a single value for polyline format
 */
function encodeValue(value: number): string {
  // Step 1: Take the signed value and shift left by 1
  let encoded = value < 0 ? ~(value << 1) : value << 1;

  let result = '';

  // Step 2: Break into 5-bit chunks
  while (encoded >= 0x20) {
    result += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63);
    encoded >>= 5;
  }

  result += String.fromCharCode(encoded + 63);

  return result;
}

/**
 * Simplify path using Douglas-Peucker algorithm
 * Reduces number of points while preserving visual shape
 *
 * @param points Array of [lat, lon] coordinates
 * @param tolerance Maximum distance threshold (default: 0.0005 ≈ 56m)
 */
export function simplifyPath(points: [number, number][], tolerance: number = 0.0005): [number, number][] {
  if (points.length <= 2) return points;

  // Find point with maximum distance from line segment
  let maxDistance = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPath(points.slice(maxIndex), tolerance);

    // Merge results (remove duplicate middle point)
    return [...left.slice(0, -1), ...right];
  } else {
    // Max distance is less than tolerance - return just endpoints
    return [start, end];
  }
}

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // Handle degenerate case where line segment is a point
  if (dx === 0 && dy === 0) {
    return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
  }

  // Calculate perpendicular distance
  const numerator = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(dx ** 2 + dy ** 2);

  return numerator / denominator;
}
