package inviterender

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"math"
	"net/http"
	"strings"

	"github.com/fogleman/gg"
	xdraw "golang.org/x/image/draw"
)

func renderImageZone(dc *gg.Context, z Zone, outW, outH float64) {
	imgBytes, err := fetchImageBytes(z.ImageSrc)
	if err != nil {
		log.Printf("[inviterender] fetch imageSrc for zone %s: %v", z.ID, err)
		return
	}
	srcImg, _, err := image.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		log.Printf("[inviterender] decode image for zone %s: %v", z.ID, err)
		return
	}

	frameW := (z.WidthPct / 100) * outW
	frameH := (z.HeightPct / 100) * outH
	if frameW <= 0 {
		frameW = 0.3 * outW
	}
	if frameH <= 0 {
		frameH = 0.3 * outH
	}

	cx := (z.XPct / 100) * outW
	cy := (z.YPct / 100) * outH

	scale := z.ImageScale
	if scale <= 0 {
		scale = 1.0
	}
	opacity := z.Opacity
	if opacity <= 0 {
		opacity = 1.0
	}

	srcW := float64(srcImg.Bounds().Dx())
	srcH := float64(srcImg.Bounds().Dy())
	if srcW == 0 || srcH == 0 {
		return
	}
	imgRatio := srcW / srcH
	boxRatio := frameW / frameH

	shape := z.FrameShape
	if shape == "" {
		shape = "circle"
	}

	var drawW, drawH float64
	wider := imgRatio > boxRatio
	if (shape == "none" && !wider) || (shape != "none" && wider) {
		drawH = frameH * scale
		drawW = drawH * imgRatio
	} else {
		drawW = frameW * scale
		drawH = drawW / imgRatio
	}

	coordScale := outH / cardH
	offX := z.ImageOffsetX * coordScale
	offY := z.ImageOffsetY * coordScale

	drawX := cx - drawW/2 + offX
	drawY := cy - drawH/2 + offY

	iW, iH := int(drawW), int(drawH)
	if iW <= 0 || iH <= 0 {
		return
	}

	scaled := image.NewRGBA(image.Rect(0, 0, iW, iH))
	xdraw.BiLinear.Scale(scaled, scaled.Bounds(), srcImg, srcImg.Bounds(), xdraw.Over, nil)

	mask := buildShapeMask(shape, frameW, frameH, drawW, drawH, cx-drawX, cy-drawY)

	destRect := image.Rect(int(drawX), int(drawY), int(drawX)+iW, int(drawY)+iH)
	outImg, ok := dc.Image().(draw.Image)
	if !ok {
		return
	}

	if opacity >= 1.0 {
		draw.DrawMask(outImg, destRect, scaled, image.Point{}, mask, image.Point{}, draw.Over)
	} else {
		tmp := image.NewRGBA(image.Rect(0, 0, iW, iH))
		draw.DrawMask(tmp, tmp.Bounds(), scaled, image.Point{}, mask, image.Point{}, draw.Over)
		applyAlpha(tmp, opacity)
		draw.Draw(outImg, destRect, tmp, image.Point{}, draw.Over)
	}

	if z.FrameColor != "" && shape != "none" {
		fc := parseHexColor(z.FrameColor)
		ringColor := color.NRGBA{fc.R, fc.G, fc.B, uint8(float64(fc.A) * opacity)}
		drawFrameRings(dc, shape, cx, cy, frameW, frameH, ringColor)
	}
}

func fetchImageBytes(src string) ([]byte, error) {
	if strings.HasPrefix(src, "data:") {
		comma := strings.IndexByte(src, ',')
		if comma < 0 {
			return nil, nil
		}
		return base64.StdEncoding.DecodeString(src[comma+1:])
	}
	resp, err := http.Get(src) //nolint:gosec
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func buildShapeMask(shape string, frameW, frameH, drawW, drawH, frameCX, frameCY float64) image.Image {
	iW, iH := int(drawW), int(drawH)
	mdc := gg.NewContext(iW, iH)
	mdc.SetColor(color.White)
	hw := frameW / 2
	hh := frameH / 2
	drawGoShape(mdc, shape, frameCX, frameCY, hw, hh)
	mdc.Fill()
	return mdc.Image()
}

func drawGoShape(mdc *gg.Context, shape string, cx, cy, hw, hh float64) {
	switch shape {
	case "circle":
		r := math.Min(hw, hh)
		mdc.DrawCircle(cx, cy, r)
	case "oval":
		mdc.DrawEllipse(cx, cy, hw*0.9, hh)
	case "heart":
		mdc.MoveTo(cx, cy-hh*0.45)
		mdc.CubicTo(cx-hw*1.05, cy-hh*1.1, cx-hw*1.25, cy+hh*0.25, cx, cy+hh*0.85)
		mdc.CubicTo(cx+hw*1.25, cy+hh*0.25, cx+hw*1.05, cy-hh*1.1, cx, cy-hh*0.45)
		mdc.ClosePath()
	case "arch":
		r := hw
		mdc.MoveTo(cx-hw, cy+hh)
		mdc.LineTo(cx-hw, cy-hh+r)
		for i := 0; i <= 32; i++ {
			a := math.Pi + float64(i)*math.Pi/32
			mdc.LineTo(cx+r*math.Cos(a), cy-hh+r+r*math.Sin(a))
		}
		mdc.LineTo(cx+hw, cy+hh)
		mdc.ClosePath()
	case "diamond":
		mdc.MoveTo(cx, cy-hh)
		mdc.LineTo(cx+hw, cy)
		mdc.LineTo(cx, cy+hh)
		mdc.LineTo(cx-hw, cy)
		mdc.ClosePath()
	case "hexagon":
		for i := 0; i < 6; i++ {
			a := float64(i)*math.Pi/3 - math.Pi/2
			px := cx + math.Cos(a)*hw
			py := cy + math.Sin(a)*hh
			if i == 0 {
				mdc.MoveTo(px, py)
			} else {
				mdc.LineTo(px, py)
			}
		}
		mdc.ClosePath()
	default: // "none"
		mdc.DrawRectangle(cx-hw, cy-hh, hw*2, hh*2)
	}
}

func drawFrameRings(dc *gg.Context, shape string, cx, cy, frameW, frameH float64, c color.NRGBA) {
	dc.Push()
	dc.SetRGBA255(int(c.R), int(c.G), int(c.B), int(float64(c.A)*0.7))
	dc.SetLineWidth(1)
	drawGoShape(dc, shape, cx, cy, (frameW+14)/2, (frameH+14)/2)
	dc.Stroke()
	dc.SetRGBA255(int(c.R), int(c.G), int(c.B), int(c.A))
	dc.SetLineWidth(3)
	drawGoShape(dc, shape, cx, cy, (frameW+6)/2, (frameH+6)/2)
	dc.Stroke()
	dc.Pop()
}

func applyAlpha(img *image.RGBA, alpha float64) {
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := img.RGBAAt(x, y)
			c.A = uint8(float64(c.A) * alpha)
			img.SetRGBA(x, y, c)
		}
	}
}
