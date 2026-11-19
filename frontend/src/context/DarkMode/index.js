import React, { createContext, useState, useContext, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import { ThemeProvider as MUIThemeProvider } from "@material-ui/core/styles";
import { CssBaseline } from "@material-ui/core";

import createAppTheme from "../../theme";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // like the Apple apps: "Automático" follows the computer or the phone (dark at night when it is set so), or the person fixes light or dark;
  // the button goes Automático → Claro → Escuro and the choice is remembered
  const saved = () => { try { const v = window.localStorage.getItem("theme"); return v === "dark" || v === "light" ? v : null; } catch (e) { return null; } };
  const system = () => { try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return false; } };
  const [mode, setMode] = useState(() => saved() || "auto");
  const [darkMode, setDarkMode] = useState(() => (saved() ? saved() === "dark" : system()));

  useEffect(() => {
    let query;
    try { query = window.matchMedia("(prefers-color-scheme: dark)"); } catch (e) { return undefined; }
    const onChange = (e) => { if (!saved()) setDarkMode(e.matches); };
    if (query.addEventListener) query.addEventListener("change", onChange); else query.addListener(onChange);
    return () => { if (query.removeEventListener) query.removeEventListener("change", onChange); else query.removeListener(onChange); };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    // native controls (scrollbars, selects, date pickers) and the browser bar follow the theme
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", darkMode ? "#161717" : "#0B4279");
  }, [darkMode]);

  const toggleTheme = () => {
    const next = mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
    try { if (next === "auto") window.localStorage.removeItem("theme"); else window.localStorage.setItem("theme", next); } catch (e) { /* private window */ }
    setMode(next);
    setDarkMode(next === "auto" ? system() : next === "dark");
  };

  const theme = useMemo(
    () => createAppTheme(darkMode ? "dark" : "light"),
    [darkMode]
  );

  const contextValue = useMemo(() => ({ darkMode, mode, toggleTheme }), [darkMode, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeContext.Provider value={contextValue}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  );
};
ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useThemeContext = () => useContext(ThemeContext);
