package inviterender

import (
	"bytes"
	"fmt"
	"image/color"
	"image/draw"
	"log"
	"math"
	"strings"

	embeddedFonts "github.com/godopetza/go-invite-render/fonts"

	"github.com/fogleman/gg"
	"github.com/go-text/render"
	"github.com/go-text/typesetting/di"
	"github.com/go-text/typesetting/font"
	"github.com/go-text/typesetting/shaping"
	"golang.org/x/image/math/fixed"
)

// TextAlign mirrors "left" | "center" | "right".
type TextAlign int

const (
	AlignLeft TextAlign = iota
	AlignCenter
	AlignRight
)

func drawShapedText(
	dc *gg.Context,
	text string,
	x, y, wrapWidth float64,
	fontFile string,
	fontSize float64,
	c color.NRGBA,
	align TextAlign,
	lineHeightFactor float64,
) {
	img, ok := dc.Image().(draw.Image)
	if !ok {
		log.Printf("[inviterender] gg context image is not a draw.Image; skipping text %q", text)
		return
	}

	data, err := embeddedFonts.FS.ReadFile(fontFile)
	if err != nil {
		log.Printf("[inviterender] read embedded font %s: %v", fontFile, err)
		return
	}
	face, err := font.ParseTTF(bytes.NewReader(data))
	if err != nil {
		log.Printf("[inviterender] parse font %s: %v", fontFile, err)
		return
	}

	shaper := &shaping.HarfbuzzShaper{}
	size26 := pxToFixed(fontSize)
	lines := wrapShapedLines(text, face, shaper, size26, wrapWidth)
	ascent, _, _ := faceVerticalMetrics(face, size26)
	lineH := fontSize * lineHeightFactor
	blockH := float64(len(lines)) * lineH
	firstBaseline := y - blockH/2 + ascent

	renderer := &render.Renderer{
		FontSize: float32(fontSize),
		PixScale: 1.0,
		Color:    c,
	}

	for i, line := range lines {
		out := shapeLine(line, face, shaper, size26)
		lineW := fixedToPx(out.Advance)
		var lineX float64
		switch align {
		case AlignLeft:
			lineX = x
		case AlignRight:
			lineX = x - lineW
		default:
			lineX = x - lineW/2
		}
		lineY := firstBaseline + float64(i)*lineH
		renderer.DrawShapedRunAt(out, img, int(lineX), int(lineY))
	}
}

func shapeLine(text string, face *font.Face, shaper shaping.Shaper, size fixed.Int26_6) shaping.Output {
	runes := []rune(text)
	return shaper.Shape(shaping.Input{
		Text:      runes,
		RunStart:  0,
		RunEnd:    len(runes),
		Direction: di.DirectionLTR,
		Face:      face,
		Size:      size,
	})
}

func wrapShapedLines(text string, face *font.Face, shaper shaping.Shaper, size fixed.Int26_6, wrapWidth float64) []string {
	var out []string
	for _, paragraph := range strings.Split(text, "\n") {
		if fixedToPx(shapeLine(paragraph, face, shaper, size).Advance) <= wrapWidth {
			out = append(out, paragraph)
			continue
		}
		words := strings.Fields(paragraph)
		if len(words) == 0 {
			out = append(out, "")
			continue
		}
		current := words[0]
		for _, w := range words[1:] {
			candidate := current + " " + w
			if fixedToPx(shapeLine(candidate, face, shaper, size).Advance) <= wrapWidth {
				current = candidate
				continue
			}
			out = append(out, current)
			current = w
		}
		out = append(out, current)
	}
	return out
}

func faceVerticalMetrics(face *font.Face, size fixed.Int26_6) (ascent, descent, lineGap float64) {
	ext, ok := face.FontHExtents()
	if !ok {
		sz := fixedToPx(size)
		return sz * 0.8, sz * 0.2, 0
	}
	upem := face.Upem()
	if upem == 0 {
		sz := fixedToPx(size)
		return sz * 0.8, sz * 0.2, 0
	}
	scale := fixedToPx(size) / float64(upem)
	return float64(ext.Ascender) * scale, float64(-ext.Descender) * scale, float64(ext.LineGap) * scale
}

func fixedToPx(f fixed.Int26_6) float64  { return float64(f) / 64.0 }
func pxToFixed(px float64) fixed.Int26_6 { return fixed.Int26_6(math.Round(px * 64)) }

func drawUnderline(
	dc *gg.Context,
	text string,
	x, y, wrapWidth float64,
	fontFile string,
	fontSize float64,
	c color.NRGBA,
	align TextAlign,
) {
	data, err := embeddedFonts.FS.ReadFile(fontFile)
	if err != nil {
		return
	}
	face, err := font.ParseTTF(bytes.NewReader(data))
	if err != nil {
		return
	}
	shaper := &shaping.HarfbuzzShaper{}
	size26 := pxToFixed(fontSize)
	lines := wrapShapedLines(text, face, shaper, size26, wrapWidth)
	ascent, _, _ := faceVerticalMetrics(face, size26)
	lineH := fontSize
	blockH := float64(len(lines)) * lineH
	firstBaseline := y - blockH/2 + ascent

	dc.SetRGBA255(int(c.R), int(c.G), int(c.B), int(c.A))
	lineThickness := fontSize * 0.06
	if lineThickness < 1 {
		lineThickness = 1
	}
	for i, line := range lines {
		out := shapeLine(line, face, shaper, size26)
		lineW := fixedToPx(out.Advance)
		var lineX float64
		switch align {
		case AlignLeft:
			lineX = x
		case AlignRight:
			lineX = x - lineW
		default:
			lineX = x - lineW/2
		}
		baselineY := firstBaseline + float64(i)*lineH
		underY := baselineY + fontSize*0.07
		dc.DrawRectangle(lineX, underY, lineW, lineThickness)
		dc.Fill()
	}
}

var _ = fmt.Sprintf
