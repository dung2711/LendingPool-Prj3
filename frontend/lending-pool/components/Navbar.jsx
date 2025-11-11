"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletConnect from './WalletConnect';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import HistoryIcon from '@mui/icons-material/History';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';

const drawerWidth = 260;

const navItems = [
    { title: 'Home', path: '/', icon: HomeIcon },
    { title: 'Dashboard', path: '/dashboard', icon: DashboardIcon },
    { title: 'Supply', path: '/supply', icon: AccountBalanceIcon },
    { title: 'Borrow', path: '/borrow', icon: TrendingUpIcon },
    { title: 'History', path: '/history', icon: HistoryIcon },
];

export default function Navbar() {
    const pathname = usePathname();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [mobileOpen, setMobileOpen] = useState(false);
    const [desktopOpen, setDesktopOpen] = useState(true);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const handleDesktopToggle = () => {
        setDesktopOpen(!desktopOpen);
    };

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Logo/Brand */}
            <Box sx={{ p: 3, pb: 2 }}>
                <Link href="/" style={{ textDecoration: 'none' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccountBalanceIcon sx={{ fontSize: 32, color: 'secondary.main' }} />
                        <Box>
                            <Typography variant="h5" fontWeight="bold" color="text.primary">
                                Lending Pool
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                DeFi Platform
                            </Typography>
                        </Box>
                    </Box>
                </Link>
            </Box>

            <Divider sx={{ mx: 2 }} />

            {/* Navigation Items */}
            <List sx={{ px: 2, py: 2, flexGrow: 1 }}>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.path;
                    
                    return (
                        <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                            <ListItemButton
                                component={Link}
                                href={item.path}
                                onClick={isMobile ? handleDrawerToggle : undefined}
                                sx={{
                                    borderRadius: 2,
                                    py: 1.5,
                                    backgroundColor: isActive ? 'primary.main' : 'transparent',
                                    color: isActive ? 'white' : 'text.primary',
                                    '&:hover': {
                                        backgroundColor: isActive ? 'primary.dark' : 'action.hover',
                                    },
                                }}
                            >
                                <ListItemIcon sx={{ 
                                    color: isActive ? 'white' : 'primary.main',
                                    minWidth: 40
                                }}>
                                    <Icon />
                                </ListItemIcon>
                                <ListItemText 
                                    primary={item.title}
                                    primaryTypographyProps={{
                                        fontWeight: isActive ? 'bold' : 'medium',
                                        fontSize: '0.95rem'
                                    }}
                                />
                            </ListItemButton>
                        </ListItem>
                    );
                })}
            </List>

            <Divider sx={{ mx: 2 }} />

            {/* Wallet Connect */}
            <Box sx={{ p: 3 }}>
                <WalletConnect />
            </Box>
        </Box>
    );

    return (
        <>
            {/* Hamburger Menu Button */}
            <IconButton
                color="primary"
                aria-label="toggle drawer"
                edge="start"
                onClick={isMobile ? handleDrawerToggle : handleDesktopToggle}
                sx={{ 
                    position: 'fixed', 
                    top: 16, 
                    left: isMobile ? 16 : (desktopOpen ? 16 : 16),
                    zIndex: theme.zIndex.drawer + 2,
                    backgroundColor: 'background.paper',
                    boxShadow: 3,
                    '&:hover': {
                        backgroundColor: 'action.hover',
                    },
                    transition: 'left 0.3s ease',
                }}
            >
                <MenuIcon />
            </IconButton>

            {/* Desktop Drawer */}
            {!isMobile && (
                <Drawer
                    variant="persistent"
                    anchor="left"
                    open={desktopOpen}
                    sx={{
                        width: desktopOpen ? drawerWidth : 0,
                        flexShrink: 0,
                        transition: 'width 0.3s ease',
                        [`& .MuiDrawer-paper`]: {
                            width: drawerWidth,
                            boxSizing: 'border-box',
                            borderRight: '1px solid',
                            borderColor: 'divider',
                            transition: 'transform 0.3s ease',
                        },
                    }}
                >
                    {drawerContent}
                </Drawer>
            )}

            {/* Mobile Drawer */}
            {isMobile && (
                <Drawer
                    variant="temporary"
                    anchor="left"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{
                        keepMounted: true, // Better mobile performance
                    }}
                    sx={{
                        [`& .MuiDrawer-paper`]: {
                            width: drawerWidth,
                            boxSizing: 'border-box',
                        },
                    }}
                >
                    {drawerContent}
                </Drawer>
            )}
        </>
    );
}