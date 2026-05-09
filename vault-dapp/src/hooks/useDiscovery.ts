// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { useState, useCallback } from 'react';
import { Contract } from 'ethers';
import { ADDRESSES, SEPOLIA_START_BLOCK } from '../contracts/addresses';
import { DAO_FACTORY_ABI, DAO_ABI, CPE_ABI } from '../contracts/abis';
import { getReadProvider } from './useVault';

export interface DiscoverableDAO {
  address: string;
  role: 'admin' | 'member' | 'none';
  name: string;
  createdAt: number;
}

export interface DiscoverablePolicy {
  id: string;
  name: string;
  role: 'admin' | 'subject';
  createdAt: number;
}

export function useDiscovery() {
  const [foundDAOs, setFoundDAOs] = useState<DiscoverableDAO[]>([]);
  const [foundPolicies, setFoundPolicies] = useState<DiscoverablePolicy[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const scanForDAOs = useCallback(async (userAddress: string) => {
    if (!userAddress) return [];
    setIsScanning(true);
    const results: DiscoverableDAO[] = [];

    try {
      const provider = getReadProvider();
      const factory = new Contract(ADDRESSES.DAOFactory, DAO_FACTORY_ABI, provider);

      // 1. Get all DAOs deployed by factory
      const allDAOs: string[] = await factory.getAllDAOs();
      console.log('[useDiscovery] allDAOs from factory:', allDAOs);

      // 2. Fetch all DAOCreated events to get names/timestamps
      const filter = factory.filters.DAOCreated();
      const logs = await factory.queryFilter(filter, SEPOLIA_START_BLOCK);
      console.log('[useDiscovery] DAOCreated logs count:', logs.length);
      
      const metaMap: Record<string, { name: string; timestamp: number }> = {};
      for (const log of logs) {
        if ('args' in log && log.args) {
          try {
            const [daoAddr, adminAddr, name] = log.args;
            console.log(`[useDiscovery] Log found: DAO=${daoAddr}, Admin=${adminAddr}, Name=${name}`);
            metaMap[daoAddr.toLowerCase()] = { 
              name, 
              timestamp: Date.now() // temporary until we find a faster way for block timestamp
            };
          } catch (e) {
            console.error('[useDiscovery] Error parsing log args:', e);
          }
        }
      }

      // 3. Scan each DAO for user role
      const scanPromises = allDAOs.map(async (daoAddr) => {
        try {
          const dao = new Contract(daoAddr, DAO_ABI, provider);
          const meta = metaMap[daoAddr.toLowerCase()] || { name: 'Unknown DAO', timestamp: Date.now() };

          // Check Owner
          const owner = await dao.owner();
          console.log(`[useDiscovery] DAO ${daoAddr}: owner is ${owner}`);
          if (owner.toLowerCase() === userAddress.toLowerCase()) {
            console.log(`[useDiscovery] Found ADMIN for ${daoAddr}`);
            return { 
              address: daoAddr, 
              role: 'admin' as const, 
              name: meta.name, 
              createdAt: meta.timestamp 
            };
          }

          // Check Membership
          const isMember = await dao.isMember(userAddress);
          console.log(`[useDiscovery] DAO ${daoAddr}: isMember(${userAddress}) = ${isMember}`);
          if (isMember) {
            console.log(`[useDiscovery] Found MEMBER for ${daoAddr}`);
            return { 
              address: daoAddr, 
              role: 'member' as const, 
              name: meta.name, 
              createdAt: meta.timestamp 
            };
          }

          // Return with role 'none' if neither owner nor member
          return {
            address: daoAddr,
            role: 'none' as const,
            name: meta.name,
            createdAt: meta.timestamp
          };
        } catch (e) {
          console.error(`[useDiscovery] Failed to scan DAO ${daoAddr}:`, e);
        }
        return null;
      });

      const scanResults = await Promise.all(scanPromises);
      scanResults.forEach(r => {
        if (r) results.push(r);
      });

      setFoundDAOs(results);
    } catch (e) {
      console.error('Discovery scan failed:', e);
    } finally {
      setIsScanning(false);
    }
    return results;
  }, []);

  const scanForPolicies = useCallback(async (userAddress: string) => {
    if (!userAddress) return [];
    const results: DiscoverablePolicy[] = [];
    try {
      const provider = getReadProvider();
      const cpe = new Contract(ADDRESSES.ConfidentialPolicyEngine, CPE_ABI, provider);

      // Query PolicyCreated events where user is the admin
      const createdFilter = cpe.filters.PolicyCreated(null, userAddress);
      const createdLogs = await cpe.queryFilter(createdFilter, SEPOLIA_START_BLOCK);
      
      // Query AddressBound events where user is the subject
      const boundFilter = cpe.filters.AddressBound(null, userAddress);
      const boundLogs = await cpe.queryFilter(boundFilter, SEPOLIA_START_BLOCK);

      const policyIds = new Set<string>();
      const roles: Record<string, 'admin' | 'subject'> = {};
      const timestamps: Record<string, number> = {};

      for (const log of createdLogs) {
        if ('args' in log && log.args) {
          const [pid, , ts] = log.args;
          const pidStr = String(pid);
          policyIds.add(pidStr);
          roles[pidStr] = 'admin';
          timestamps[pidStr] = Number(ts) * 1000;
        }
      }

      for (const log of boundLogs) {
        if ('args' in log && log.args) {
          const [pid, , ts] = log.args;
          const pidStr = String(pid);
          policyIds.add(pidStr);
          if (roles[pidStr] !== 'admin') {
            roles[pidStr] = 'subject';
          }
          timestamps[pidStr] = Number(ts) * 1000;
        }
      }

      for (const pid of policyIds) {
        const savedName = window.localStorage.getItem(`policyName:${pid.toLowerCase()}`);
        const name = savedName || `Policy ${pid.slice(0, 10)}...`;
        results.push({
          id: pid,
          name,
          role: roles[pid],
          createdAt: timestamps[pid] || Date.now(),
        });
      }

      setFoundPolicies(results);
    } catch (e) {
      console.error('[useDiscovery] scanForPolicies failed:', e);
    }
    return results;
  }, []);

  return { foundDAOs, foundPolicies, isScanning, scanForDAOs, scanForPolicies };
}
