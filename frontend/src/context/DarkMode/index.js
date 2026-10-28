import React, { createContext, useState, useContext, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import { ThemeProvider as MUIThemeProvider } from "@material-ui/core/styles";
import { CssBaseline } from "@material-ui/core";

import createAppTheme from "../../theme";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // follows the computer (dark / light) until the person chooses with the button; then the choice is remembered
  const saved = () => { try { const v = window.localStorage.getItem("theme"); return v === "dark" || v === "light" ? v : null; } catch (e) { return null; } };
  const system = () => { try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return false; } };
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
    if (meta) meta.setAttribute("content", darkMode ? "#070d17" : "#0B4279");
  }, [darkMode]);

  const toggleTheme = () => {
    setDarkMode((prevMode) => {
      try { window.localStorage.setItem("theme", prevMode ? "light" : "dark"); } catch (e) { /* private window */ }
      return !prevMode;
    });
  };

  const theme = useMemo(
    () => createAppTheme(darkMode ? "dark" : "light"),
    [darkMode]
  );

  const contextValue = useMemo(() => ({ darkMode, toggleTheme }), [darkMode]);

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
