"use client";

import RefreshIcon from "@mui/icons-material/Refresh";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { proposalService } from "@/services/proposalService";
import {
  getProposalStatusColor,
  type ProposalHistoryItem,
  ProposalStatus,
  type ProposalStatusFilter,
  proposalStatusLabel,
} from "@/types/governance";

const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "11155111";

const statusOptions: Array<{ label: string; value: ProposalStatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Proposed", value: ProposalStatus.Proposed },
  { label: "Scheduled", value: ProposalStatus.Scheduled },
  { label: "Executed", value: ProposalStatus.Executed },
  { label: "Cancelled", value: ProposalStatus.Cancelled },
];

const truncate = (value: string | null | undefined): string => {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const getActionLabel = (proposal: ProposalHistoryItem): string => {
  const action = proposal.decodedAction;
  if (!action) {
    return "Unknown action";
  }

  if (action.kind === "timelock-schedule") {
    return `Schedule -> ${truncate(action.target)} (delay ${action.delay}s)`;
  }

  return `ScheduleBatch (${action.targets.length} targets, delay ${action.delay}s)`;
};

export default function ProposalsPage(): ReactElement {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProposalStatusFilter>("all");
  const [proposals, setProposals] = useState<ProposalHistoryItem[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const totalByStatus = useMemo(
    () =>
      proposals.reduce<Record<ProposalStatus, number>>(
        (acc, proposal) => {
          acc[proposal.status] += 1;
          return acc;
        },
        {
          [ProposalStatus.Proposed]: 0,
          [ProposalStatus.Scheduled]: 0,
          [ProposalStatus.Executed]: 0,
          [ProposalStatus.Cancelled]: 0,
        },
      ),
    [proposals],
  );

  const fetchProposals = async (): Promise<void> => {
    try {
      setLoading(true);
      setError("");

      const data = await proposalService.getProposalHistory({
        take: 100,
        skip: 0,
        chainId: CHAIN_ID,
        status: statusFilter,
      });

      setProposals(data);
      setLastUpdatedAt(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load proposal history: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [statusFilter]);

  return (
    <Box sx={{ maxWidth: 1440, mx: "auto", px: { xs: 1, md: 2 }, py: 3 }}>
      <Typography variant="h4" fontWeight="bold" mb={1}>
        Governance Proposal History
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Public timeline of Safe multisig and timelock proposals.
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(event) =>
                  setStatusFilter(event.target.value as ProposalStatusFilter)
                }
              >
                {statusOptions.map((option) => (
                  <MenuItem key={String(option.value)} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchProposals}
              disabled={loading}
            >
              Refresh
            </Button>
          </Box>

          <Box
            sx={{
              mt: 2,
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Chip
              label={`Proposed: ${totalByStatus[ProposalStatus.Proposed]}`}
            />
            <Chip
              label={`Scheduled: ${totalByStatus[ProposalStatus.Scheduled]}`}
            />
            <Chip
              label={`Executed: ${totalByStatus[ProposalStatus.Executed]}`}
            />
            <Chip
              label={`Cancelled: ${totalByStatus[ProposalStatus.Cancelled]}`}
            />
            <Chip label={`Total: ${proposals.length}`} color="primary" />
          </Box>

          {lastUpdatedAt && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 2, display: "block" }}
            >
              Last updated: {lastUpdatedAt.toLocaleString()}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Typography color="error">{error}</Typography>
          ) : proposals.length === 0 ? (
            <Typography color="text.secondary">No proposals found</Typography>
          ) : (
            <TableContainer>
              <Table sx={{ minWidth: 1000 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Action</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Signers</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>
                      Operation ID
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Safe Tx</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>ETA</TableCell>
                    <TableCell sx={{ fontWeight: "bold" }}>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {proposals.map((proposal) => (
                    <TableRow
                      key={`${proposal.id}-${proposal.updatedAt}`}
                      hover
                    >
                      <TableCell>
                        <Chip
                          size="small"
                          color={getProposalStatusColor(proposal.status)}
                          label={proposalStatusLabel[proposal.status]}
                        />
                      </TableCell>

                      <TableCell>
                        <Tooltip
                          title={JSON.stringify(
                            proposal.decodedAction || {},
                            null,
                            2,
                          )}
                        >
                          <Typography
                            variant="body2"
                            sx={{ maxWidth: 260 }}
                            noWrap
                          >
                            {getActionLabel(proposal)}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2">
                          {proposal.currentSigners}/{proposal.multisigThreshold}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Tooltip title={proposal.operationId || ""}>
                          <Typography variant="body2">
                            {truncate(proposal.operationId)}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      <TableCell>
                        <Tooltip title={proposal.safeTxHash || ""}>
                          <Typography variant="body2">
                            {truncate(proposal.safeTxHash)}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2">
                          {formatDate(proposal.eta)}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2">
                          {formatDate(proposal.createdAt)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export const dynamic = "force-dynamic";
