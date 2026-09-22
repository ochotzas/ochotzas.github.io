export const SKIN_COUNT = 10;

export const mark = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  skin: number,
  knockout: string,
) => {
  c.save();
  c.translate(x, y);
  c.fillStyle = knockout;
  c.strokeStyle = knockout;
  c.lineCap = "round";

  const dot = (dx: number, dy: number, size: number) => {
    c.beginPath();
    c.arc(dx * r, dy * r, size * r, 0, Math.PI * 2);
    c.fill();
  };

  const bar = (angle: number, width: number, length: number) => {
    c.save();
    c.rotate(angle);
    c.lineWidth = width * r;
    c.beginPath();
    c.moveTo(-length * r, 0);
    c.lineTo(length * r, 0);
    c.stroke();
    c.restore();
  };

  const ring = (radius: number, width: number) => {
    c.lineWidth = width * r;
    c.beginPath();
    c.arc(0, 0, radius * r, 0, Math.PI * 2);
    c.stroke();
  };

  switch (skin % SKIN_COUNT) {
    case 1:
      dot(0, 0, 0.38);
      break;
    case 2:
      ring(0.55, 0.16);
      break;
    case 3:
      ring(0.62, 0.12);
      ring(0.3, 0.12);
      break;
    case 4:
      bar(0, 0.26, 0.62);
      break;
    case 5:
      bar(Math.PI / 2, 0.26, 0.62);
      break;
    case 6:
      bar(0, 0.22, 0.6);
      bar(Math.PI / 2, 0.22, 0.6);
      break;
    case 7:
      dot(-0.38, -0.38, 0.2);
      dot(0.38, -0.38, 0.2);
      dot(-0.38, 0.38, 0.2);
      dot(0.38, 0.38, 0.2);
      break;
    case 8:
      c.beginPath();
      c.arc(0, 0, r * 0.92, Math.PI / 2, (Math.PI * 3) / 2);
      c.fill();
      break;
    case 9:
      bar(Math.PI / 4, 0.22, 0.5);
      bar(-Math.PI / 4, 0.22, 0.5);
      break;
    default:
      break;
  }

  c.restore();
};
