"use client";

import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useState } from "react";
import Navbar from "@/components/Navbar";

const theme = createTheme({
	palette: {
		primary: {
			main: "#1976d2",
		},
		secondary: {
			main: "#dc004e",
		},
	},
});

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body style={{ margin: 0, padding: 0 }}>
				<ThemeProvider theme={theme}>
					<CssBaseline />
					<Box sx={{ display: "flex", minHeight: "100vh" }}>
						<Navbar />
						<Box
							component="main"
							sx={{
								flexGrow: 1,
								p: { xs: 2, sm: 3 },
								width: "100%",
								minHeight: "100vh",
								backgroundColor: "#f5f5f5",
								mt: { xs: 7, sm: 0 },
							}}
						>
							{children}
						</Box>
					</Box>
				</ThemeProvider>
			</body>
		</html>
	);
}
