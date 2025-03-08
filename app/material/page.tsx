"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Folder, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

// Type for material items
type MaterialItem = {
  id: string;
  title: string;
  description: string;
  type: "strategy" | "branding" | "guidelines";
  url: string;
  createdAt: string;
  updatedAt: string;
};

export default function Material() {
  const [searchQuery, setSearchQuery] = useState("");

  // Placeholder data - will be replaced with actual data from your backend
  const materials: MaterialItem[] = [];

  return (
    <div className="bg-background overflow-hidden overflow-y-clip overscroll-y-none">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Company Materials</h1>
          <p className="text-muted-foreground text-sm">
            Access and manage company strategy and branding materials
          </p>
        </div>

        <div className="border rounded-lg">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search materials..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button className="ml-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Material
                </Button>
              </div>

              {materials.length === 0 ? (
                <div className="text-center py-12">
                  <Folder className="h-12 w-12 text-muted-foreground/60 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No materials yet</h3>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    Start by adding your company strategy documents and
                    materials.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-300px)]">
                  <div className="space-y-4">
                    {/* Material items will be rendered here */}
                  </div>
                </ScrollArea>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
