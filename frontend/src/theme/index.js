import { alpha, createTheme } from "@material-ui/core/styles";

import palette from "./palette";

const borderRadius = {
  small: "6px",
  medium: "12px",
  input: "8px",
  table: "12px",
  pill: "999px",
};

const FONT =
  '"Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const createAppTheme = (type) => {
  const colors = palette[type];
  const isDark = type === "dark";
  const base = createTheme({ palette: { type, ...colors } });
  const ring = alpha(colors.accent.main, isDark ? 0.3 : 0.22);

  // borders do the heavy lifting, shadows stay whisper-quiet
  const shadows = [...base.shadows];
  shadows[1] = isDark ? "0 0 0 1px #1c2b44" : "0 1px 2px 0 rgba(11,66,121,0.06)";
  shadows[2] = isDark
    ? "0 1px 3px 0 rgba(0,0,0,0.5)"
    : "0 1px 3px 0 rgba(11,66,121,0.10), 0 1px 2px -1px rgba(11,66,121,0.06)";
  shadows[3] = "0 4px 8px -2px rgba(11,66,121,0.12), 0 2px 4px -2px rgba(11,66,121,0.06)";
  shadows[8] = isDark
    ? "0 12px 32px -8px rgba(0,0,0,0.7)"
    : "0 12px 32px -8px rgba(11,66,121,0.22)";
  shadows[24] = isDark
    ? "0 24px 64px -12px rgba(0,0,0,0.8)"
    : "0 24px 64px -12px rgba(11,66,121,0.32)";

  return createTheme({
    palette: {
      type,
      ...colors,
      tintedBackground: alpha(colors.primary.main, isDark ? 0.1 : 0.07),
    },

    shape: { borderRadius: 8 },
    shadows,

    typography: {
      fontFamily: FONT,
      fontSize: 14,
      h4: { fontWeight: 600, letterSpacing: "-0.02em" },
      h5: { fontWeight: 600, letterSpacing: "-0.015em" },
      h6: { fontWeight: 600, letterSpacing: "-0.01em" },
      subtitle1: { fontWeight: 500 },
      subtitle2: { fontWeight: 600, letterSpacing: "-0.005em" },
      button: { textTransform: "none", fontWeight: 500, letterSpacing: 0 },
      sectionLabel: {
        fontSize: "12px",
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: "0",
        color: colors.text.secondary,
      },
    },

    borderRadius,

    sizing: {
      appBar: 56,
    },

    border: {
      divider: `1px solid ${colors.divider}`,
      ring: `0 0 0 2px ${colors.background.paper}`,
    },

    elevation: {
      light: shadows[2],
    },

    scrollbarStyles: {
      overflowX: "hidden",
      "&::-webkit-scrollbar": { width: "8px", height: "8px" },
      "&::-webkit-scrollbar-track": { background: "transparent" },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: colors.scrollbar.thumb,
        borderRadius: "8px",
      },
    },

    props: {
      MuiButtonBase: { disableRipple: true },
      MuiPaper: { elevation: 0 },
    },

    overrides: {
      MuiCssBaseline: {
        "@global": {
          body: {
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
            fontFeatureSettings: '"cv11", "ss01"',
            backgroundColor: colors.background.default,
          },
          "::selection": { background: alpha(colors.primary.main, 0.25) },
          "*:focus-visible": {
            outline: `2px solid ${colors.accent.main}`,
            outlineOffset: 2,
          },
          "@keyframes shimmer": {
            "0%": { backgroundPosition: "-200% 0" },
            "100%": { backgroundPosition: "200% 0" },
          },
          "@media (prefers-reduced-motion: reduce)": {
            "*": { animationDuration: "0.01ms !important", transitionDuration: "0.01ms !important" },
          },
        },
      },

      MuiButton: {
        root: {
          borderRadius: borderRadius.input,
          fontSize: "13.5px",
          fontWeight: 500,
          textTransform: "none",
          padding: "6px 14px",
          minHeight: 36,
          transition: "background-color .15s, border-color .15s, box-shadow .15s, color .15s",
        },
        sizeSmall: { minHeight: 30, padding: "3px 10px", fontSize: "13px" },
        contained: {
          boxShadow: "none",
          "&:hover": { boxShadow: "none" },
          "&:active": { boxShadow: "none" },
        },
        containedPrimary: {
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16), 0 1px 2px rgba(11,66,121,0.25)`,
          "&:hover": {
            backgroundColor: colors.primary.dark,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(9,9,11,0.12)`,
          },
        },
        outlined: {
          backgroundColor: colors.cards.background,
          borderColor: colors.divider,
          padding: "5px 13px",
          "&:hover": { backgroundColor: colors.action.hover },
        },
        outlinedPrimary: {
          borderColor: alpha(colors.primary.main, 0.4),
          "&:hover": {
            borderColor: colors.primary.main,
            backgroundColor: alpha(colors.primary.main, 0.06),
          },
        },
        outlinedSecondary: {
          color: colors.text.primary,
          borderColor: colors.divider,
          "&:hover": { backgroundColor: colors.action.hover, borderColor: colors.divider },
        },
        text: { padding: "6px 10px" },
      },

      MuiIconButton: {
        root: {
          borderRadius: borderRadius.input,
          transition: "background-color .15s",
        },
      },

      MuiOutlinedInput: {
        root: {
          borderRadius: borderRadius.input,
          backgroundColor: colors.cards.background,
          transition: "box-shadow .15s, border-color .15s",
          "& $notchedOutline": { borderColor: colors.divider },
          "&:hover $notchedOutline": { borderColor: isDark ? "#2c4062" : "#cbd5e1" },
          "&$focused $notchedOutline": { borderColor: colors.accent.main, borderWidth: 1 },
          "&$focused": { boxShadow: `0 0 0 3px ${ring}` },
        },
        input: { padding: "10px 12px" },
        inputMarginDense: { paddingTop: 8, paddingBottom: 8 },
      },
      // long labels were wrapping onto two lines and landing on top of the typed value
      MuiInputLabel: {
        outlined: {
          fontSize: 14,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "calc(100% - 28px)",
          "&$shrink": { maxWidth: "calc(133% - 40px)" },
        },
      },
      MuiFormHelperText: {
        root: { fontSize: 12, marginLeft: 2 },
        contained: { marginLeft: 2, marginRight: 0 },
      },

      MuiPaper: {
        rounded: { borderRadius: borderRadius.medium },
        outlined: {
          border: `1px solid ${colors.divider}`,
          backgroundColor: colors.cards.background,
          borderRadius: borderRadius.medium,
          boxShadow: "var(--ui-shadow-1)",
          transition: "box-shadow .2s var(--ease-out), border-color .2s var(--ease-out), transform .2s var(--ease-out)",
          "&$rounded": { borderRadius: borderRadius.medium },
        },
      },
      MuiCard: {
        root: { borderRadius: borderRadius.medium },
      },

      MuiDialog: {
        paper: {
          borderRadius: 16,
          border: `1px solid ${colors.divider}`,
          boxShadow: shadows[24],
          backgroundImage: "none",
        },
      },
      MuiBackdrop: {
        root: {
          backgroundColor: isDark ? "rgba(2,6,12,0.7)" : "rgba(8,32,60,0.45)",
          backdropFilter: "blur(3px)",
        },
      },
      MuiDialogTitle: {
        root: { padding: "22px 24px 6px" },
      },
      MuiTypography: {
        h6: { fontSize: "1.05rem" },
      },
      MuiDialogContent: {
        root: { padding: "12px 24px 8px" },
        dividers: {
          padding: "12px 24px",
          borderTop: "none",
          borderBottom: "none",
        },
      },
      MuiDialogActions: {
        root: { padding: "16px 24px 20px", gap: 8 },
        spacing: { "& > :not(:first-child)": { marginLeft: 0 } },
      },

      MuiMenu: {
        paper: {
          borderRadius: borderRadius.medium,
          border: `1px solid ${colors.divider}`,
          boxShadow: shadows[8],
          marginTop: 4,
        },
        list: { padding: 4 },
      },
      MuiMenuItem: {
        root: {
          borderRadius: borderRadius.small,
          fontSize: 14,
          minHeight: 36,
          margin: "1px 0",
        },
      },
      MuiPopover: {
        paper: { borderRadius: borderRadius.medium, border: `1px solid ${colors.divider}` },
      },

      MuiTableCell: {
        root: {
          borderBottom: `1px solid ${colors.divider}`,
          padding: "12px 16px",
        },
        head: {
          fontSize: 12.5,
          fontWeight: 500,
          color: colors.text.secondary,
          backgroundColor: isDark ? "#0a1322" : "#f8fafc",
          lineHeight: 1.4,
        },
        sizeSmall: { padding: "8px 12px" },
      },
      MuiTableRow: {
        root: {
          transition: "background-color .15s var(--ease-out)",
          "&:last-child td": { borderBottom: 0 },
        },
        hover: { "&:hover": { backgroundColor: colors.action.hover } },
      },

      MuiChip: {
        root: { fontWeight: 500, fontSize: 12.5 },
        sizeSmall: { height: 22 },
      },

      MuiTabs: {
        root: {
          minHeight: 40,
          padding: 4,
          borderRadius: 10,
          backgroundColor: isDark ? "#0a1322" : "#eef2f7",
        },
        indicator: { display: "none" },
        flexContainer: { gap: 2 },
      },
      MuiTab: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          fontSize: 13.5,
          minHeight: 32,
          minWidth: 0,
          letterSpacing: 0,
          borderRadius: 8,
          padding: "4px 14px",
          color: colors.text.secondary,
          "&$selected": {
            color: colors.text.primary,
            backgroundColor: colors.cards.background,
            boxShadow: shadows[2],
          },
        },
      },

      MuiTooltip: {
        tooltip: {
          backgroundColor: isDark ? "#f1f5f9" : "#0b1a2e",
          color: isDark ? "#0b1a2e" : "#f1f5f9",
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 6,
          padding: "5px 9px",
        },
        arrow: { color: isDark ? "#f1f5f9" : "#0b1a2e" },
      },

      MuiSwitch: {
        // off: grey track + white knob; on: brand track + white knob with a check
        root: { width: 44, height: 26, padding: 0, margin: 8 },
        switchBase: {
          padding: 3,
          color: "#fff",
          "&$checked": {
            transform: "translateX(18px)",
            color: "#fff",
            "& + $track": {
              opacity: 1,
              backgroundColor: isDark ? colors.accent.main : colors.primary.main,
            },
            "& $thumb": {
              backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
                `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='none' stroke='${
                  isDark ? colors.accent.main : colors.primary.main
                }' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round' d='M5 12.5l4.5 4.5L19 7.5'/></svg>`
              )}")`,
              backgroundSize: "70%",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            },
          },
          "&$disabled": { opacity: 0.55 },
        },
        colorPrimary: {
          "&$checked": { color: "#fff", "& + $track": { backgroundColor: isDark ? colors.accent.main : colors.primary.main } },
        },
        colorSecondary: {
          "&$checked": { color: "#fff", "& + $track": { backgroundColor: isDark ? colors.accent.main : colors.primary.main } },
        },
        sizeSmall: { width: 36, height: 22, padding: 0, "& $switchBase": { padding: 2, "&$checked": { transform: "translateX(14px)" } }, "& $thumb": { width: 18, height: 18 } },
        thumb: { width: 20, height: 20, boxShadow: "0 1px 2px rgba(0,0,0,.3)", transition: "background-color .15s" },
        track: {
          borderRadius: 13,
          opacity: 1,
          backgroundColor: isDark ? "#3a5073" : "#aab6c4",
          transition: "background-color .2s",
        },
      },

      // the search boxes (new conversation, transfer) rendered as tall empty frames
      MuiAutocomplete: {
        inputRoot: {
          '&[class*="MuiOutlinedInput-root"]': {
            padding: "6px 10px",
            "& $input": { padding: "6px 4px", minWidth: 80 },
            '& $endAdornment': { right: 8 },
          },
        },
      },

      MuiListItem: {
        root: { "&$selected": { backgroundColor: colors.action.selected } },
      },

      MuiBadge: {
        badge: { fontWeight: 600, fontSize: 11 },
        colorPrimary: {
          backgroundColor: colors.accent.highlight,
          color: colors.accent.onHighlight,
        },
      },

      MuiLinearProgress: {
        root: { borderRadius: 4, height: 6 },
      },

      MuiAlert: {
        root: { borderRadius: borderRadius.input },
      },

      MuiAvatar: {
        root: { fontWeight: 500 },
      },

      MuiAppBar: {
        colorPrimary: { backgroundColor: colors.appBar.background },
      },
    },
  });
};

export default createAppTheme;
