package inviterender

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"log"
	"strings"

	"github.com/fogleman/gg"
	qrcode "github.com/skip2/go-qrcode"
)

// Zone defines a single layer on the invitation card.
// Positions (XPct, YPct) and sizes (WidthPct, HeightPct) are expressed as
// percentages of the output canvas dimensions so zones scale correctly to
// any background image resolution.
type Zone struct {
	ID         string  `json:"id"`
	Type       string  `json:"type"`       // "text" | "image" | "qr"
	Text       string  `json:"text"`       // supports {{token}} substitution
	XPct       float64 `json:"xPct"`       // horizontal centre (0–100)
	YPct       float64 `json:"yPct"`       // vertical centre (0–100)
	FontSize   float64 `json:"fontSize"`   // editor-space px (scaled to output)
	Color      string  `json:"color"`      // "#RRGGBB" or "#RRGGBBAA"
	FontFamily string  `json:"fontFamily"` // see Fonts section in README
	Bold       bool    `json:"bold"`
	Italic     bool    `json:"italic"`
	Underline  bool    `json:"underline,omitempty"`
	Align      string  `json:"align"`   // "left" | "center" | "right"
	Opacity    float64 `json:"opacity"` // 0.0–1.0, defaults to 1.0
	// Image zone
	ImageSrc     string  `json:"imageSrc,omitempty"`   // URL or data URI
	FrameShape   string  `json:"frameShape,omitempty"` // circle|oval|heart|arch|diamond|hexagon|none
	FrameColor   string  `json:"frameColor,omitempty"`
	WidthPct     float64 `json:"widthPct,omitempty"`
	HeightPct    float64 `json:"heightPct,omitempty"`
	ImageOffsetX float64 `json:"imageOffsetX,omitempty"`
	ImageOffsetY float64 `json:"imageOffsetY,omitempty"`
	ImageScale   float64 `json:"imageScale,omitempty"`
}

// cardH is the editor coordinate-space height. Font sizes and Y positions
// authored in the editor are scaled from this reference height to the actual
// output resolution at render time, so cards look identical regardless of
// the background image's native pixel dimensions.
const cardH = 1100.0

// RenderCard composites zones onto a background image and returns a PNG.
//
// bgData      — raw bytes of any image format Go's stdlib can decode (JPEG, PNG, GIF)
// zones       — ordered list of layers (bottom to top)
// fields      — token substitution map, e.g. {"guest_name": "Amina Hassan"}
//
// Special field key: "__checkin_token__" — value is encoded into QR zones.
func RenderCard(bgData []byte, zones []Zone, fields map[string]string) ([]byte, error) {
	bgImg, _, err := image.Decode(bytes.NewReader(bgData))
	if err != nil {
		return nil, fmt.Errorf("decode background: %w", err)
	}

	bgBounds := bgImg.Bounds()
	outW := float64(bgBounds.Dx())
	outH := float64(bgBounds.Dy())

	dc := gg.NewContext(int(outW), int(outH))
	dc.DrawImage(bgImg, 0, 0)

	scaleY := outH / cardH

	for _, z := range zones {
		switch z.Type {
		case "image":
			if z.ImageSrc == "" {
				continue
			}
			renderImageZone(dc, z, outW, outH)

		case "qr":
			token, ok := fields["__checkin_token__"]
			if !ok || token == "" {
				continue
			}
			qrSize := int(z.WidthPct / 100 * outW)
			if qrSize < 50 {
				qrSize = 96
			}
			qrImg, err := qrcode.New(token, qrcode.Medium)
			if err != nil {
				log.Printf("[inviterender] QR generation failed for zone %s: %v", z.ID, err)
				continue
			}
			qrImg.DisableBorder = true
			qrImage := qrImg.Image(qrSize)
			x := int((z.XPct / 100) * outW)
			y := int((z.YPct / 100) * outH)
			draw.Draw(dc.Image().(draw.Image), image.Rect(x, y, x+qrSize, y+qrSize),
				qrImage, image.Point{}, draw.Over)

		default: // "text"
			text := SubstituteTokens(z.Text, fields)
			if text == "" {
				continue
			}
			fontSize := z.FontSize * scaleY
			ff := fontFileName(z.FontFamily, z.Bold, z.Italic)
			x := (z.XPct / 100) * outW
			y := (z.YPct / 100) * outH
			c := parseHexColor(z.Color)
			opacity := z.Opacity
			if opacity <= 0 {
				opacity = 1
			}
			drawColor := color.NRGBA{c.R, c.G, c.B, uint8(float64(c.A) * opacity)}
			var align TextAlign
			switch z.Align {
			case "left":
				align = AlignLeft
			case "right":
				align = AlignRight
			default:
				align = AlignCenter
			}
			wrapWidth := outW
			if z.WidthPct > 0 {
				wrapWidth = z.WidthPct / 100.0 * outW
			}
			drawShapedText(dc, text, x, y, wrapWidth, ff, fontSize, drawColor, align, 1.0)
			if z.Underline {
				drawUnderline(dc, text, x, y, wrapWidth, ff, fontSize, drawColor, align)
			}
		}
	}

	var buf bytes.Buffer
	enc := &png.Encoder{CompressionLevel: png.BestCompression}
	if err := enc.Encode(&buf, dc.Image()); err != nil {
		return nil, fmt.Errorf("encode PNG: %w", err)
	}
	return buf.Bytes(), nil
}

// SubstituteTokens replaces all {{key}} occurrences in s using fields.
func SubstituteTokens(s string, fields map[string]string) string {
	for k, v := range fields {
		s = strings.ReplaceAll(s, "{{"+k+"}}", v)
	}
	return s
}

// DefaultQRZone returns a QR zone positioned at the bottom-left of the card.
func DefaultQRZone() Zone {
	return Zone{
		ID:       "qr",
		Type:     "qr",
		XPct:     8,
		YPct:     90,
		WidthPct: 12,
	}
}

// fontFileName resolves a family + style to the embedded TTF filename.
// Matching is lenient — strips non-alphanumerics and lowercases before
// comparing so "Cormorant Garamond", "cormorant", and "CormorantGaramond"
// all resolve to the same face.
func fontFileName(family string, bold, italic bool) string {
	key := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		if r >= 'A' && r <= 'Z' {
			return r + ('a' - 'A')
		}
		return -1
	}, family)

	prefix := ""
	switch key {
	case "greatvibes", "greatvibesregular":
		return "GreatVibes-Regular.ttf"
	case "cormorantgaramond", "cormorant":
		prefix = "CormorantGaramond"
	case "playfairdisplay", "playfair":
		prefix = "PlayfairDisplay"
	case "montserrat":
		prefix = "Montserrat"
	default:
		log.Printf("[inviterender] unknown font family %q — falling back to Montserrat", family)
		prefix = "Montserrat"
	}
	suffix := "Regular"
	if bold && italic {
		suffix = "BoldItalic"
	} else if bold {
		suffix = "Bold"
	} else if italic {
		suffix = "Italic"
	}
	return prefix + "-" + suffix + ".ttf"
}

func parseHexColor(s string) color.NRGBA {
	s = strings.TrimPrefix(s, "#")
	if len(s) == 3 {
		s = string([]byte{s[0], s[0], s[1], s[1], s[2], s[2]})
	}
	b, err := hex.DecodeString(s)
	if err != nil || len(b) < 3 {
		return color.NRGBA{0, 0, 0, 255}
	}
	a := uint8(255)
	if len(b) >= 4 {
		a = b[3]
	}
	return color.NRGBA{b[0], b[1], b[2], a}
}
